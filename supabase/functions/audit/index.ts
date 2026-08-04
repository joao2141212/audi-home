/**
 * Edge Function: audit
 * 
 * Auditoria de despesas e listagem:
 * - GET /list-expenses: Listar despesas pendentes de auditoria
 * - POST /audit-manual: Auditar uma transação manualmente
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CNPJService } from "../_shared/cnpj-service.ts";
import { RobustValidator } from "../_shared/robust-validator.ts";
import { AuditLogService } from "../_shared/audit-log-service.ts";
import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";

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
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = getSupabaseSecretKey();
        const supabase = createClient(supabaseUrl, supabaseKey);

        const url = new URL(req.url);
        const path = url.pathname.split('/').pop();

        const body = req.method === 'POST' ? await req.json() : {};
        const action = body.action || url.searchParams.get('action') || path;

        // POST /audit { action: 'audit-manual', ... }
        if (req.method === 'POST' && action === 'audit-manual') {
            const {
                transaction_id,
                cnpj_fornecedor,
                service_type,
                condominio_id,
                descricao_nf,
                actor_id
            } = body;

            console.log(`🔍 Auditing transaction ${transaction_id} for CNPJ ${cnpj_fornecedor}`);

            // Validar CNPJ usando o serviço portado
            const cnpjService = new CNPJService();
            const robustValidator = new RobustValidator();

            let fornecedorData: any = null;
            let riskLevel = 'CRITICAL_RISK';
            let cnaeValidation: any = null;

            try {
                fornecedorData = await cnpjService.validateCNPJ(cnpj_fornecedor);
                riskLevel = cnpjService.getRiskLevel(fornecedorData);

                // Validar CNAE vs Serviço
                if (service_type && fornecedorData.cnae_principal) {
                    cnaeValidation = robustValidator.validateCnaeService(
                        fornecedorData.cnae_principal.codigo,
                        [],
                        service_type
                    );
                }
            } catch (e: any) {
                console.error(`CNPJ não encontrado: ${e.message}`);
            }

            let status = 'APPROVED';
            let relatorio = '✅ APROVADO: Fornecedor ativo e regular.';

            if (!fornecedorData || fornecedorData.status_receita !== 'ATIVA') {
                status = 'REJECTED';
                relatorio = `❌ REJEITADO: Empresa com situação '${fornecedorData?.status_receita || 'Não encontrada'}'.`;
            } else if (cnaeValidation?.valid === false) {
                status = 'WARNING';
                relatorio = `⚠️ ALERTA: CNAE incompatível - ${cnaeValidation.reason}`;
            }

            // Registrar auditoria
            const auditLogService = new AuditLogService(supabase);
            await auditLogService.logAction({
                entity_type: "expense",
                entity_id: transaction_id || cnpj_fornecedor,
                action: status === 'APPROVED' ? 'APPROVE' : 'REJECT',
                actor_id: actor_id || 'MANUAL',
                new_state: {
                    cnpj: cnpj_fornecedor,
                    status,
                    risk_level: riskLevel,
                    cnae_valid: cnaeValidation?.valid
                }
            });

            return new Response(
                JSON.stringify({
                    status,
                    risk_level: riskLevel,
                    fornecedor: fornecedorData ? {
                        razao_social: fornecedorData.razao_social,
                        nome_fantasia: fornecedorData.nome_fantasia,
                        status_cadastral: fornecedorData.status_receita,
                        cnae_principal: fornecedorData.cnae_principal,
                        municipio: fornecedorData.municipio,
                        uf: fornecedorData.uf,
                        cached: fornecedorData.cached,
                        provider: fornecedorData.provider
                    } : null,
                    validacao_cnae: cnaeValidation,
                    relatorio_compliance: relatorio
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // GET /audit?action=list-expenses&condominio_id={id}
        if (req.method === 'GET' && (action === 'list-expenses' || url.pathname.includes('/list-expenses'))) {
            const condominioId = url.searchParams.get('condominio_id') || 'default';
            const status = url.searchParams.get('status');
            const limit = parseInt(url.searchParams.get('limit') || '50');

            console.log(`📋 Listing expenses for condo: ${condominioId}`);

            let query = supabase
                .from('transacoes_bancarias')
                .select('*, comprovantes(*)')
                .eq('condominio_id', condominioId)
                .eq('type', 'DEBIT')
                .order('data_transacao', { ascending: false })
                .limit(limit);

            if (status) {
                query = query.eq('status_reconciliacao', status);
            }

            const { data: transacoes, error: txError } = await query;

            if (txError) throw txError;

            const expenses = (transacoes || []).map((tx: any) => ({
                id: tx.id,
                description: tx.descricao,
                amount: tx.valor,
                date: tx.data_transacao,
                category: "Geral",
                status_reconciliacao: tx.status_reconciliacao,
                auditStatus: tx.comprovantes?.status_auditoria || 'pendente',
                has_comprovante: !!tx.comprovantes,
                comprovante: tx.comprovantes ? {
                    id: tx.comprovantes.id,
                    nome_arquivo: tx.comprovantes.nome_arquivo,
                    status_auditoria: tx.comprovantes.status_auditoria,
                    fraud_score: tx.comprovantes.ocr_data?.fraud_score
                } : null
            }));

            // Calcular resumo
            const resumo = {
                total: expenses.length,
                com_comprovante: expenses.filter((e: any) => e.has_comprovante).length,
                sem_comprovante: expenses.filter((e: any) => !e.has_comprovante).length,
                aprovados: expenses.filter((e: any) => e.auditStatus === 'aprovado').length,
                pendentes: expenses.filter((e: any) => e.auditStatus === 'pendente').length,
                rejeitados: expenses.filter((e: any) => e.auditStatus === 'rejeitado').length,
                valor_total: expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0)
            };

            return new Response(
                JSON.stringify({
                    resumo,
                    expenses,
                    total: expenses.length
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({
                error: 'Endpoint não encontrado',
                available_endpoints: [
                    'POST /audit { action: "audit-manual", cnpj_fornecedor: "...", service_type: "..." }',
                    'GET /audit?action=list-expenses&condominio_id=xxx'
                ]
            }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('❌ Erro na função audit:', error);
        return new Response(
            JSON.stringify({ error: error?.message || 'Erro interno' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
