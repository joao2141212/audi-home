import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { runDeterministicFraudChecks } from './deterministic-checks.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getAuthenticatedContext(req: Request) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('AUTH_REQUIRED')

    const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await authClient.auth.getUser()
    if (userError || !user) throw new Error('AUTH_REQUIRED')

    const adminClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: perfil, error: perfilError } = await adminClient
        .from('perfis')
        .select('id, role, condominio_id')
        .eq('id', user.id)
        .single()

    if (perfilError || !perfil) throw new Error('PROFILE_NOT_FOUND')

    return { perfil, adminClient }
}

// ── ISPB map (principais bancos brasileiros) ────────────────────────────────
const ISPB_MAP: Record<string, string> = {
    '60746948': 'Bradesco',
    '60701190': 'Itaú Unibanco',
    '33172537': 'Santander',
    '00360305': 'Caixa Econômica Federal',
    '00000000': 'Banco do Brasil',
    '92894922': 'Nubank / Nu Pagamentos',
    '18236120': 'BS2',
    '00204963': 'Banco Inter',
    '13505419': 'C6 Bank',
    '20855875': 'Neon Pagamentos',
    '45246410': 'Mercado Pago',
    '32997490': 'PicPay',
    '30680829': 'Banco BMG',
    '07679404': 'Banco Sicoob',
    '04902979': 'Banco Banrisul',
    '58160789': 'Banco Safra',
}

// ── Validate Pix E2E ID format (BACEN spec: 32 chars) ──────────────────────
// Format: E{8-ISPB}{8-YYYYMMDD}{4-HHmm}{11-random} = 32 chars total
function validateE2EId(e2e: string): {
    valid: boolean
    ispb: string | null
    dateStr: string | null
    timeStr: string | null
    banco: string | null
    error: string | null
} {
    if (!e2e || !e2e.startsWith('E') || e2e.length !== 32) {
        return { valid: false, ispb: null, dateStr: null, timeStr: null, banco: null, error: `Tamanho inválido: ${e2e?.length} chars (esperado 32)` }
    }

    const ispb    = e2e.slice(1, 9)   // 8 digits
    const date    = e2e.slice(9, 17)  // YYYYMMDD
    const time    = e2e.slice(17, 21) // HHmm
    const random  = e2e.slice(21)     // 11 chars

    if (!/^\d{8}$/.test(ispb)) {
        return { valid: false, ispb: null, dateStr: null, timeStr: null, banco: null, error: 'ISPB inválido (deve ter 8 dígitos)' }
    }
    if (!/^\d{8}$/.test(date)) {
        return { valid: false, ispb, dateStr: null, timeStr: null, banco: null, error: 'Data inválida no E2E ID' }
    }
    if (!/^\d{4}$/.test(time)) {
        return { valid: false, ispb, dateStr: date, timeStr: null, banco: null, error: 'Hora inválida no E2E ID' }
    }
    if (!/^[A-Za-z0-9]{11}$/.test(random)) {
        return { valid: false, ispb, dateStr: date, timeStr: time, banco: null, error: 'Sufixo aleatório inválido no E2E ID' }
    }

    const banco = ISPB_MAP[ispb] || `ISPB ${ispb} (desconhecido)`
    return { valid: true, ispb, dateStr: date, timeStr: time, banco, error: null }
}

// ── Compare documents from document date vs E2E date ──────────────────────
function e2eDateMatchesDoc(e2eDate: string, docDate: string): boolean {
    // e2eDate = YYYYMMDD, docDate = YYYY-MM-DD or DD/MM/YYYY
    const e2eNorm = e2eDate // YYYYMMDD
    let docNorm = docDate?.replace(/-/g, '').replace(/\//g, '')
    // If DD/MM/YYYY → DDMMYYYY → convert to YYYYMMDD
    if (docNorm?.length === 8 && parseInt(docNorm.slice(0, 4)) < 1900) {
        docNorm = docNorm.slice(4, 8) + docNorm.slice(2, 4) + docNorm.slice(0, 2)
    }
    return e2eNorm === docNorm
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { comprovante_id, file_base64, mime_type, filename } = await req.json()

        const { perfil, adminClient } = await getAuthenticatedContext(req)

        const { data: comprovante, error: comprovanteError } = await adminClient
            .from('comprovantes')
            .select('id, condominio_id')
            .eq('id', comprovante_id)
            .single()

        if (comprovanteError || !comprovante) throw new Error('RECEIPT_NOT_FOUND')
        if (perfil.role !== 'master' && perfil.condominio_id !== comprovante.condominio_id) {
            throw new Error('FORBIDDEN_CONDO')
        }

        const supabase = adminClient

        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY')
        if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY ou GOOGLE_API_KEY não configurada')
        const MODEL = 'gemini-3.1-flash-lite-preview'

        // ── STEP 1: OCR — Multi-document via Gemini Flash Lite ──────────────
        const prompt = `Você é um auditor fiscal brasileiro especializado em detectar fraudes em documentos financeiros.
Analise CUIDADOSAMENTE este documento e identifique o tipo. Retorne SOMENTE JSON puro (sem markdown, sem texto fora do JSON).

REGRAS CRÍTICAS DE ANÁLISE:
- Compare TODOS os dados entre pagador e recebedor — se o CPF/CNPJ de quem pagou for IGUAL ao de quem recebeu, isso é AUTO-TRANSFERÊNCIA
- Valide o Número de Controle/E2E ID: deve ter exatamente 32 caracteres começando com E
- Verifique se a data dentro do E2E ID bate com a data do documento
- Se qualquer campo parecer editado, inconsistente ou suspeito, sinalize em "alertas_ocr"

Retorne neste formato:
{
  "tipo_documento": "COMPROVANTE_PIX" | "NOTA_FISCAL" | "BOLETO" | "RECIBO" | "DESCONHECIDO",

  // === Para COMPROVANTE_PIX ===
  "pix": {
    "e2e_id": "código de controle completo (ex: E60746948...)",
    "valor": número decimal,
    "data": "YYYY-MM-DD",
    "hora_declarada": "HH:MM:SS",
    "pagador_nome": "nome completo",
    "pagador_cpf_cnpj": "somente dígitos visíveis ou mascarados como ***.***.***-**",
    "pagador_banco": "nome do banco",
    "recebedor_nome": "nome completo",
    "recebedor_cpf_cnpj": "somente dígitos visíveis ou mascarados como ***.***.***-**",
    "recebedor_banco": "nome do banco",
    "recebedor_chave": "chave pix (email, telefone, cpf, cnpj ou chave aleatória)",
    "autotransferencia_suspeita": true | false,
    "banco_origem_declarado": "nome do banco na interface/cabeçalho"
  },

  // === Para NOTA_FISCAL / RECIBO ===
  "nf": {
    "cnpj_emissor": "somente números",
    "razao_social_emissor": "nome da empresa",
    "data_emissao": "YYYY-MM-DD",
    "valor_total": número decimal,
    "numero_nf": "número da nota",
    "descricao_servico": "descrição",
    "natureza_servico": "Manutenção|Limpeza|Obra|Segurança|Administração|Outros",
    "municipio": "cidade"
  },

  // === Para BOLETO ===
  "boleto": {
    "banco": "nome do banco",
    "cedente": "quem emitiu",
    "sacado": "quem deve pagar",
    "valor": número decimal,
    "vencimento": "YYYY-MM-DD",
    "nosso_numero": "código do boleto",
    "codigo_barras": "código de barras se visível"
  },

  "confianca": número de 0 a 100,
  "alertas_ocr": ["lista de inconsistências visuais detectadas — ex: fonte diferente, data editada, etc"],
  "erro": null ou "DOCUMENTO_INVALIDO"
}`

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type, data: file_base64 } }] }],
                    generationConfig: { temperature: 0.05, maxOutputTokens: 2048 }
                })
            }
        )

        if (!geminiRes.ok) throw new Error(`Gemini API error: ${geminiRes.status}`)

        const geminiData = await geminiRes.json()
        let rawText = geminiData.candidates[0]?.content?.parts[0]?.text || ''
        rawText = rawText.replace(/```json\s*/g, '').replace(/```/g, '').trim()

        let ocr: any = {}
        try { ocr = JSON.parse(rawText) } catch { ocr = { erro: 'PARSE_ERROR', raw: rawText } }

        if (ocr.erro === 'DOCUMENTO_INVALIDO') {
            await supabase.from('comprovantes').update({
                ocr_processado: true, ocr_erro: ocr.erro,
                status_auditoria: 'rejeitado', fraud_score: 100,
                fraud_flags: ['DOCUMENTO_INVALIDO'], tipo_documento: 'DESCONHECIDO'
            }).eq('id', comprovante_id)
            return new Response(JSON.stringify({ success: false, erro: ocr.erro }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // ── STEP 2: Fraud analysis — PIX ────────────────────────────────────
        let fraudScore = 0
        const fraudFlags: string[] = []
        const tipoDoc = ocr.tipo_documento || 'DESCONHECIDO'

        const updatePayload: any = {
            ocr_processado: true,
            tipo_documento: tipoDoc,
            ocr_confianca: ocr.confianca || 60,
            ocr_texto_completo: JSON.stringify(ocr),
        }

        // === PIX-specific fraud checks =====================================
        let e2eValid: boolean | null = null
        let e2eBancoCompat: boolean | null = null
        let e2eDataCompat: boolean | null = null
        let pixAutoTransferencia = false

        if (tipoDoc === 'COMPROVANTE_PIX' && ocr.pix) {
            const p = ocr.pix

            updatePayload.pix_e2e_id            = p.e2e_id
            updatePayload.pix_pagador_doc        = p.pagador_cpf_cnpj
            updatePayload.pix_pagador_banco      = p.pagador_banco
            updatePayload.pix_recebedor_doc      = p.recebedor_cpf_cnpj
            updatePayload.pix_recebedor_banco    = p.recebedor_banco
            updatePayload.pix_chave              = p.recebedor_chave
            updatePayload.valor                  = p.valor
            updatePayload.data_emissao           = p.data
            updatePayload.ocr_valor              = p.valor
            updatePayload.ocr_data               = p.data
            updatePayload.ocr_razao_social       = p.pagador_nome
            updatePayload.descricao              = `Pix de ${p.pagador_nome} → ${p.recebedor_nome}`

            // 1. AUTO-TRANSFERÊNCIA — ms flagrante e mais fácil de detectar
            const pagDoc = (p.pagador_cpf_cnpj || '').replace(/\D/g, '')
            const recDoc = (p.recebedor_cpf_cnpj || '').replace(/\D/g, '')
            const nomesPagRec = (p.pagador_nome || '').toLowerCase().trim() === (p.recebedor_nome || '').toLowerCase().trim()

            // Compara os dígitos visíveis (estrelas são iguais = mesmo mascaramento = mesmo doc)
            const docsSuspect = p.autotransferencia_suspeita ||
                (pagDoc.length > 4 && recDoc.length > 4 && pagDoc === recDoc) ||
                nomesPagRec

            if (docsSuspect) {
                fraudScore += 90
                fraudFlags.push('AUTOTRANSFERENCIA')
                pixAutoTransferencia = true
            }
            updatePayload.pix_autotransferencia = pixAutoTransferencia

            // 2. E2E ID VALIDATION
            if (p.e2e_id) {
                const e2eCheck = validateE2EId(p.e2e_id)
                e2eValid = e2eCheck.valid

                if (!e2eCheck.valid) {
                    fraudScore += 60
                    fraudFlags.push('CODIGO_E2E_INVALIDO')
                } else {
                    // 3. ISPB vs banco declarado
                    const bancoDeclarado = (p.banco_origem_declarado || p.pagador_banco || '').toLowerCase()
                    const bancoE2E = (e2eCheck.banco || '').toLowerCase()
                    e2eBancoCompat = bancoDeclarado.length === 0 || 
                        bancoE2E.includes(bancoDeclarado.split(' ')[0]) ||
                        bancoDeclarado.includes(bancoE2E.split(' ')[0])

                    if (!e2eBancoCompat) {
                        fraudScore += 50
                        fraudFlags.push('BANCO_E2E_INCOMPATIVEL')
                    }

                    // 4. Data no E2E vs data declarada no doc
                    if (e2eCheck.dateStr && p.data) {
                        const docDateNorm = p.data.replace(/-/g, '') // YYYYMMDD from YYYY-MM-DD
                        e2eDataCompat = e2eDateMatchesDoc(e2eCheck.dateStr, p.data)
                        if (!e2eDataCompat) {
                            fraudScore += 45
                            fraudFlags.push('DATA_E2E_INCOMPATIVEL')
                        }
                    }
                }
            } else {
                fraudScore += 30
                fraudFlags.push('SEM_CODIGO_E2E')
            }

            // 5. Alertas visuais do OCR (ex: fonte diferente, edição detectada)
            if (Array.isArray(ocr.alertas_ocr) && ocr.alertas_ocr.length > 0) {
                fraudScore += Math.min(ocr.alertas_ocr.length * 15, 40)
                fraudFlags.push('INCONSISTENCIAS_VISUAIS')
            }

            // 6. Baixa confiança
            if ((ocr.confianca || 100) < 60) { fraudScore += 15; fraudFlags.push('BAIXA_CONFIANCA_OCR') }

            // ── MULTI-VERIFY: Run deterministic layer independently of AI ────
            const deterministicResult = runDeterministicFraudChecks({
                e2e_id:                p.e2e_id,
                valor:                 p.valor,
                data:                  p.data,
                hora_declarada:        p.hora_declarada,
                pagador_cpf_cnpj:      p.pagador_cpf_cnpj,
                pagador_banco:         p.pagador_banco,
                recebedor_cpf_cnpj:    p.recebedor_cpf_cnpj,
                recebedor_banco:       p.recebedor_banco,
                recebedor_chave:       p.recebedor_chave,
                banco_origem_declarado: p.banco_origem_declarado
            })

            // Merge: flags from both layers union'd, score = max(AI, deterministic)
            for (const signal of deterministicResult.signals) {
                if (!fraudFlags.includes(signal.flag)) {
                    fraudFlags.push(signal.flag)
                    // Only add score if it wasn't already caught by AI
                    fraudScore = Math.min(fraudScore + (fraudScore < signal.score ? signal.score - fraudScore : 0), 100)
                }
            }

            // Deterministic score overrides if higher
            if (deterministicResult.total_score > fraudScore) {
                fraudScore = deterministicResult.total_score
            }

            // E2E validation metadata
            if (deterministicResult.e2e_validation) {
                const ev = deterministicResult.e2e_validation
                updatePayload.e2e_id_valido        = ev.valid
                updatePayload.e2e_banco_compativel = !fraudFlags.includes('BANCO_E2E_INCOMPATIVEL')
                updatePayload.e2e_data_compativel  = !fraudFlags.includes('DATA_E2E_INCOMPATIVEL')
            }

            // 7. E2E duplicado (mesmo código de controle já está no sistema)
            if (p.e2e_id) {
                const { data: dupeE2E } = await supabase
                    .from('comprovantes')
                    .select('id')
                    .eq('pix_e2e_id', p.e2e_id)
                    .neq('id', comprovante_id)
                    .limit(1)
                if (dupeE2E && dupeE2E.length > 0) {
                    fraudScore += 90; fraudFlags.push('CODIGO_E2E_DUPLICADO')
                }
            }

            updatePayload.e2e_id_valido         = e2eValid
            updatePayload.e2e_banco_compativel   = e2eBancoCompat
            updatePayload.e2e_data_compativel    = e2eDataCompat

        // === NF / Recibo ===================================================
        } else if ((tipoDoc === 'NOTA_FISCAL' || tipoDoc === 'RECIBO') && ocr.nf) {
            const nf = ocr.nf

            updatePayload.valor          = nf.valor_total
            updatePayload.data_emissao   = nf.data_emissao
            updatePayload.ocr_valor      = nf.valor_total
            updatePayload.ocr_data       = nf.data_emissao
            updatePayload.ocr_cnpj       = nf.cnpj_emissor
            updatePayload.ocr_razao_social = nf.razao_social_emissor
            updatePayload.ocr_nsu        = nf.numero_nf
            updatePayload.descricao      = nf.descricao_servico
            updatePayload.natureza_servico = nf.natureza_servico || 'Outros'

            // CNPJ validation via BrasilAPI (with cache)
            let cnpjStatus = 'NAO_VERIFICADO'
            let cnpjCnaes: string[] = []

            if (nf.cnpj_emissor) {
                const cleanCnpj = nf.cnpj_emissor.replace(/\D/g, '')
                const { data: cached } = await supabase.from('fornecedores').select('*').eq('cnpj', cleanCnpj).single()

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
                            cnpjCnaes = [String(rfbData.cnae_fiscal || ''), ...(rfbData.cnaes_secundarios?.map((c: any) => String(c.codigo)) || [])].filter(Boolean)
                            await supabase.from('fornecedores').upsert({
                                cnpj: cleanCnpj, razao_social: rfbData.razao_social,
                                situacao_cadastral: cnpjStatus, cnae_principal_codigo: String(rfbData.cnae_fiscal || ''),
                                cnaes_secundarios: rfbData.cnaes_secundarios, rfb_ultima_consulta: new Date().toISOString(), rfb_raw_response: rfbData
                            }, { onConflict: 'cnpj' })
                        }
                    } catch (_) { cnpjStatus = 'ERRO_CONSULTA' }
                }

                updatePayload.cnpj_status = cnpjStatus
                if (cnpjStatus !== 'ATIVA') { fraudScore += 35; fraudFlags.push(`CNPJ_${cnpjStatus.replace(/\s/g, '_')}`) }

                const cnaeMap: Record<string, string[]> = {
                    'Manutenção': ['4321','4322','4329','4399','3313','3314','4330'],
                    'Limpeza': ['8121','8122','8129'], 'Obra': ['4120','4330','4391'],
                    'Segurança': ['8011','8012'], 'Administração': ['6822','6821','6811']
                }
                const expected = cnaeMap[nf.natureza_servico || 'Outros'] || []
                if (expected.length > 0 && cnpjCnaes.length > 0) {
                    const ok = cnpjCnaes.some(c => expected.some(r => c.replace(/\D/g, '').startsWith(r)))
                    if (!ok) { fraudScore += 25; fraudFlags.push('CNAE_INCOMPATIVEL') }
                }
            } else { fraudScore += 40; fraudFlags.push('SEM_CNPJ') }

            if ((ocr.confianca || 100) < 60) { fraudScore += 20; fraudFlags.push('BAIXA_CONFIANCA_OCR') }

            // Alertas visuais do OCR
            if (Array.isArray(ocr.alertas_ocr) && ocr.alertas_ocr.length > 0) {
                fraudScore += Math.min(ocr.alertas_ocr.length * 15, 40)
                fraudFlags.push('INCONSISTENCIAS_VISUAIS')
            }

        } else {
            fraudScore += 60; fraudFlags.push('TIPO_DOCUMENTO_DESCONHECIDO')
        }

        // Duplicate by filename
        const { data: dupes } = await supabase.from('comprovantes').select('id')
            .neq('id', comprovante_id).eq('arquivo_nome', filename).limit(1)
        if (dupes && dupes.length > 0) { fraudScore += 50; fraudFlags.push('ARQUIVO_DUPLICADO') }

        const finalScore = Math.min(fraudScore, 100)
        const finalStatus = finalScore >= 60 ? 'suspeito' : finalScore >= 30 ? 'alerta' : 'auditado'

        await supabase.from('comprovantes').update({
            ...updatePayload,
            fraud_score: finalScore, fraud_flags: fraudFlags, status_auditoria: finalStatus
        }).eq('id', comprovante_id)

        return new Response(JSON.stringify({
            success: true, tipo_documento: tipoDoc,
            fraud_score: finalScore, fraud_flags: fraudFlags,
            status: finalStatus, pix_autotransferencia: pixAutoTransferencia,
            e2e_valido: e2eValid, alertas_ocr: ocr.alertas_ocr || [], ocr_raw: ocr
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } catch (err: any) {
        const status =
            err?.message === 'AUTH_REQUIRED' ? 401 :
            err?.message === 'PROFILE_NOT_FOUND' || err?.message === 'FORBIDDEN_CONDO' ? 403 :
            err?.message === 'RECEIPT_NOT_FOUND' ? 404 :
            500
        return new Response(JSON.stringify({ error: err.message }), {
            status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
