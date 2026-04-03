/**
 * Edge Function: process-comprovante
 * 
 * Processa upload de comprovantes de pagamento:
 * 1. Recebe PDF/Imagem
 * 2. Extrai dados com Gemini (OCR)
 * 3. Valida CNPJ na Receita Federal (CNPJ.ws)
 * 4. Detecta fraude
 * 5. Reconcilia com extrato bancário
 * 6. Salva no Supabase
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { FraudDetector } from "../_shared/fraud-detector.ts";
import { RobustValidator } from "../_shared/robust-validator.ts";
import { CNPJService } from "../_shared/cnpj-service.ts";
import { OCRService } from "../_shared/ocr-service.ts";

declare const Deno: any;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const condominioId = formData.get('condominio_id') as string || 'default';

        if (!file) {
            return new Response(
                JSON.stringify({ error: 'Arquivo não enviado' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const startTime = Date.now();
        const bytes = new Uint8Array(await file.arrayBuffer());
        const base64 = btoa(String.fromCharCode(...bytes));
        const mimeType = file.type || 'application/pdf';

        console.log(`📤 Processando: ${file.name} (${bytes.length} bytes)`);

        // Inicializar Supabase
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Gerar IDs
        const timestamp = new Date().toISOString();
        const comprovanteId = crypto.randomUUID();
        
        const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const arquivo_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // 1. Extrair dados com OCR (Gemini)
        console.log('🔍 Extraindo dados com OCR...');
        const ocrService = new OCRService();
        const ocrResult = await ocrService.processReceipt(base64, mimeType);
        console.log(`✅ OCR: Valor=${ocrResult.ocr_valor}, CNPJ=${ocrResult.ocr_cnpj}`);

        // 2. Validar CNPJ (se encontrado)
        let validacaoCnpj = null;
        let riskLevel = null;

        if (ocrResult.ocr_cnpj) {
            console.log('🔍 Validando CNPJ...');
            const cnpjService = new CNPJService();
            try {
                const supplierData = await cnpjService.validateCNPJ(ocrResult.ocr_cnpj);
                riskLevel = cnpjService.getRiskLevel(supplierData);
                validacaoCnpj = {
                    consultado: true,
                    existe: true,
                    ativo: supplierData.status_receita === 'ATIVA',
                    razao_social_rfb: supplierData.razao_social,
                    cnae: supplierData.cnae_principal.descricao,
                    status: supplierData.status_receita,
                    risk_level: riskLevel
                };
                console.log(`✅ CNPJ: ${supplierData.razao_social} - ${supplierData.status_receita}`);
            } catch (e: any) {
                validacaoCnpj = {
                    consultado: true,
                    existe: false,
                    erro: e.message
                };
                console.log(`❌ CNPJ não encontrado: ${e.message}`);
            }
        }

        // 3. Detecção de Fraude
        console.log('🕵️ Analisando fraude...');
        const fraudDetector = new FraudDetector();
        const headerStr = new TextDecoder('latin1').decode(bytes.slice(0, 2048));
        const fraudResult = fraudDetector.analyze(mimeType, bytes.length, headerStr);
        console.log(`🛡️ Score de Fraude: ${fraudResult.fraud_score}`);

        // 4. Reconciliação Bancária
        console.log('🏦 Verificando reconciliação bancária...');

        const { data: transacoes } = await supabase
            .from('transacoes_bancarias')
            .select('*')
            .eq('condominio_id', condominioId)
            .limit(100)
            .order('data_transacao', { ascending: false });

        const robustValidator = new RobustValidator();
        const reconciliationResult = robustValidator.validatePayment(
            ocrResult.ocr_valor || 0,
            ocrResult.ocr_data || new Date().toISOString().split('T')[0],
            null,
            timestamp,
            ocrResult.ocr_cnpj || null,
            comprovanteId,
            transacoes || []
        );
        console.log(`🤝 Reconciliação: ${reconciliationResult.status}`);

        // 5. Determinar status de auditoria
        let statusAuditoria = 'pendente';
        let motivoStatus = '';

        if (fraudResult.documento_alterado || fraudResult.fraud_score > 50) {
            statusAuditoria = 'suspeito';
            motivoStatus = 'Alto risco de fraude detectado';
        } else if (reconciliationResult.status === 'APPROVED') {
            statusAuditoria = 'aprovado';
            motivoStatus = reconciliationResult.reason;
        } else if (riskLevel === 'CRITICAL_RISK') {
            statusAuditoria = 'rejeitado';
            motivoStatus = 'CNPJ inativo ou baixado';
        } else if (validacaoCnpj?.ativo) {
            statusAuditoria = 'auditado';
            motivoStatus = 'CNPJ ativo e validado';
        }

        // 6. Salvar no Supabase
        const statusClean = statusAuditoria === 'auditado' ? 'aprovado' : statusAuditoria;
        const { error: insertError } = await supabase
            .from('comprovantes')
            .insert({
                id: comprovanteId,
                condominio_id: condominioId,
                arquivo_nome: file.name,
                arquivo_hash: arquivo_hash,
                tipo_arquivo: mimeType.includes('pdf') ? 'pdf' : (mimeType.includes('png') ? 'png' : 'jpg'),
                tamanho_bytes: bytes.length,
                ocr_processado: true,
                ocr_valor: ocrResult.ocr_valor,
                ocr_data: ocrResult.ocr_data,
                ocr_cnpj: ocrResult.ocr_cnpj,
                ocr_razao_social: ocrResult.ocr_razao_social,
                ocr_nsu: ocrResult.ocr_nsu,
                ocr_codigo_barras: ocrResult.ocr_codigo_barras,
                cnpj_status: validacaoCnpj?.status,
                fraud_score: fraudResult.fraud_score,
                fraud_flags: fraudResult.fraud_flags,
                status: statusClean
            });

        const processingTime = Date.now() - startTime;

        // 7. Retornar resposta
        return new Response(
            JSON.stringify({
                id: comprovanteId,
                status: 'processado',

                dados_extraidos: {
                    cnpj: ocrResult.ocr_cnpj,
                    razao_social: ocrResult.ocr_razao_social,
                    valor: ocrResult.ocr_valor,
                    data: ocrResult.ocr_data,
                    nsu: ocrResult.ocr_nsu,
                    codigo_barras: ocrResult.ocr_codigo_barras
                },

                validacao_cnpj: validacaoCnpj,

                fraude: {
                    score: fraudResult.fraud_score,
                    flags: fraudResult.fraud_flags,
                    documento_alterado: fraudResult.documento_alterado
                },

                reconciliacao: {
                    status: reconciliationResult.status,
                    reason: reconciliationResult.reason,
                    matches: reconciliationResult.matches.slice(0, 5)
                },

                auditoria: {
                    status: statusAuditoria,
                    motivo: motivoStatus
                },

                processamento: {
                    metodo: 'gemini_ai',
                    modelo: 'gemini-2.5-flash',
                    tokens_usados: ocrResult.tokens_used,
                    tempo_ms: processingTime
                },

                armazenamento: {
                    local: 'Supabase PostgreSQL',
                    tabela: 'comprovantes',
                    registro_id: comprovanteId,
                    timestamp: timestamp,
                    persistente: true,
                    erro: insertError?.message || null
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('❌ Erro:', error);
        return new Response(
            JSON.stringify({
                error: error.message,
                stack: error.stack
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
