import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { comprovante_id, file_base64, mime_type, filename } = await req.json()

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
        const MODEL = 'gemini-3.1-flash-lite-preview'

        // ── STEP 1: OCR via Gemini Flash Lite ──────────────────────────────
        const prompt = `Você é um auditor fiscal brasileiro especializado em Notas Fiscais e recibos.
Analise este documento e extraia os seguintes campos em formato JSON puro (sem markdown):
{
  "cnpj_emissor": "somente números, sem formatação",
  "razao_social_emissor": "nome completo da empresa emissora",
  "data_emissao": "formato YYYY-MM-DD",
  "valor_total": número decimal,
  "numero_nf": "número da nota se presente",
  "descricao_servico": "descrição do serviço ou produto",
  "natureza_servico": "Manutenção|Limpeza|Obra|Segurança|Administração|Outros",
  "municipio_emissor": "cidade",
  "confianca": número de 0 a 100 indicando sua certeza na extração
}
Se o documento não for uma NF ou recibo válido, retorne { "erro": "DOCUMENTO_INVALIDO" }.
Se algum campo não estiver presente, use null.`

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type, data: file_base64 } }
                        ]
                    }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
                })
            }
        )

        if (!geminiRes.ok) {
            throw new Error(`Gemini API error: ${geminiRes.status}`)
        }

        const geminiData = await geminiRes.json()
        let rawText = geminiData.candidates[0]?.content?.parts[0]?.text || ''
        rawText = rawText.replace(/```json\s*/g, '').replace(/```/g, '').trim()

        let ocrResult: any = {}
        try {
            ocrResult = JSON.parse(rawText)
        } catch {
            ocrResult = { erro: 'PARSE_ERROR', raw: rawText }
        }

        if (ocrResult.erro) {
            await supabase.from('comprovantes').update({
                ocr_processado: true,
                ocr_erro: ocrResult.erro,
                status_auditoria: 'rejeitado',
                fraud_score: 100,
                fraud_flags: ['DOCUMENTO_INVALIDO']
            }).eq('id', comprovante_id)

            return new Response(JSON.stringify({ success: false, erro: ocrResult.erro }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // ── STEP 2: CNPJ Validation via BrasilAPI (with cache) ─────────────
        let cnpjStatus = 'NAO_VERIFICADO'
        let cnpjCnaes: string[] = []

        if (ocrResult.cnpj_emissor) {
            const cleanCnpj = ocrResult.cnpj_emissor.replace(/\D/g, '')

            // Check cache first (7 days)
            const { data: cached } = await supabase
                .from('fornecedores')
                .select('*')
                .eq('cnpj', cleanCnpj)
                .single()

            if (cached?.rfb_ultima_consulta &&
                Date.now() - new Date(cached.rfb_ultima_consulta).getTime() < 7 * 24 * 60 * 60 * 1000) {
                cnpjStatus = cached.situacao_cadastral || 'DESCONHECIDA'
                cnpjCnaes = [cached.cnae_principal_codigo, ...(cached.cnaes_secundarios || [])].filter(Boolean)
            } else {
                try {
                    const rfbRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`)
                    if (rfbRes.ok) {
                        const rfbData = await rfbRes.json()
                        cnpjStatus = rfbData.descricao_situacao_cadastral || 'DESCONHECIDA'
                        cnpjCnaes = [
                            String(rfbData.cnae_fiscal || ''),
                            ...(rfbData.cnaes_secundarios?.map((c: any) => String(c.codigo)) || [])
                        ].filter(Boolean)

                        await supabase.from('fornecedores').upsert({
                            cnpj: cleanCnpj,
                            razao_social: rfbData.razao_social,
                            nome_fantasia: rfbData.nome_fantasia,
                            situacao_cadastral: cnpjStatus,
                            cnae_principal_codigo: String(rfbData.cnae_fiscal || ''),
                            cnaes_secundarios: rfbData.cnaes_secundarios,
                            rfb_ultima_consulta: new Date().toISOString(),
                            rfb_raw_response: rfbData
                        }, { onConflict: 'cnpj' })
                    }
                } catch (_) {
                    cnpjStatus = 'ERRO_CONSULTA'
                }
            }
        }

        // ── STEP 3: Fraud Score ─────────────────────────────────────────────
        let fraudScore = 0
        const fraudFlags: string[] = []

        if (!ocrResult.cnpj_emissor) {
            fraudScore += 40; fraudFlags.push('SEM_CNPJ')
        } else if (cnpjStatus !== 'ATIVA') {
            fraudScore += 35; fraudFlags.push(`CNPJ_${cnpjStatus.replace(/\s/g, '_')}`)
        }

        const cnaeMap: Record<string, string[]> = {
            'Manutenção': ['4321', '4322', '4329', '4399', '3313', '3314', '4330'],
            'Limpeza': ['8121', '8122', '8129'],
            'Obra': ['4120', '4330', '4391'],
            'Segurança': ['8011', '8012'],
            'Administração': ['6822', '6821', '6811']
        }
        const natureza = ocrResult.natureza_servico || 'Outros'
        const expected = cnaeMap[natureza] || []
        if (expected.length > 0 && cnpjCnaes.length > 0) {
            const hasCnae = cnpjCnaes.some(c => expected.some(r => c.replace(/\D/g, '').startsWith(r)))
            if (!hasCnae) { fraudScore += 25; fraudFlags.push('CNAE_INCOMPATIVEL') }
        }

        if ((ocrResult.confianca || 100) < 60) {
            fraudScore += 20; fraudFlags.push('BAIXA_CONFIANCA_OCR')
        }

        // Duplicate detection by filename
        const { data: dupes } = await supabase
            .from('comprovantes')
            .select('id')
            .neq('id', comprovante_id)
            .eq('arquivo_nome', filename)
            .limit(1)

        if (dupes && dupes.length > 0) {
            fraudScore += 50; fraudFlags.push('POSSIVEL_DUPLICATA')
        }

        const finalStatus = fraudScore >= 60 ? 'suspeito' : fraudScore >= 30 ? 'alerta' : 'auditado'

        // ── STEP 4: Persist results ─────────────────────────────────────────
        await supabase.from('comprovantes').update({
            ocr_processado: true,
            ocr_confianca: ocrResult.confianca || 80,
            ocr_valor: ocrResult.valor_total,
            ocr_data: ocrResult.data_emissao,
            ocr_cnpj: ocrResult.cnpj_emissor,
            ocr_razao_social: ocrResult.razao_social_emissor,
            ocr_nsu: ocrResult.numero_nf,
            ocr_texto_completo: rawText,
            cnpj_status: cnpjStatus,
            cnpj_cnae_compat: !fraudFlags.includes('CNAE_INCOMPATIVEL'),
            cnpj_validado_em: new Date().toISOString(),
            natureza_servico: natureza,
            fraud_score: Math.min(fraudScore, 100),
            fraud_flags: fraudFlags,
            status_auditoria: finalStatus,
            valor: ocrResult.valor_total,
            data_emissao: ocrResult.data_emissao,
            descricao: ocrResult.descricao_servico
        }).eq('id', comprovante_id)

        return new Response(JSON.stringify({
            success: true,
            fraud_score: Math.min(fraudScore, 100),
            fraud_flags: fraudFlags,
            status: finalStatus,
            cnpj_status: cnpjStatus,
            ocr: ocrResult
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
