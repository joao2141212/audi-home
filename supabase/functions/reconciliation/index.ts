/**
 * Edge Function: reconciliation
 * 
 * Fila de reconciliação bancária:
 * - GET: Listar sugestões de match
 * - POST /approve: Aprovar match
 * - POST /reject: Rejeitar match  
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RobustValidator } from "../_shared/robust-validator.ts";
import { AuditLogService } from "../_shared/audit-log-service.ts";

declare const Deno: any;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const auditLogService = new AuditLogService(supabase);

        // GET /reconciliation - Listar fila / sugestões de match
        if (req.method === 'GET') {
            const condominioId = url.searchParams.get('condominio_id') || 'default';
            const status = url.searchParams.get('status') || 'pendente';

            // Buscar comprovantes pendentes
            const { data: comprovantes, error: compError } = await supabase
                .from('comprovantes')
                .select('*')
                .eq('condominio_id', condominioId)
                .eq('status_auditoria', status)
                .order('data_upload', { ascending: false })
                .limit(50);

            if (compError) {
                throw new Error(`Erro ao buscar comprovantes: ${compError.message}`);
            }

            // Buscar transações pendentes
            const { data: transacoes, error: txError } = await supabase
                .from('transacoes_bancarias')
                .select('*')
                .eq('condominio_id', condominioId)
                .eq('status_reconciliacao', 'pendente')
                .order('data_transacao', { ascending: false })
                .limit(100);

            if (txError) {
                throw new Error(`Erro ao buscar transações: ${txError.message}`);
            }

            // Gerar sugestões de match
            const validator = new RobustValidator();
            const suggestions: any[] = [];

            for (const comp of comprovantes || []) {
                const ocrData = comp.ocr_data || {};
                const valor = ocrData.ocr_valor || ocrData.valor_total || 0;
                const data = ocrData.ocr_data || ocrData.data_emissao || new Date().toISOString().split('T')[0];

                const result = validator.validatePayment(
                    valor,
                    data,
                    null,
                    comp.data_upload,
                    ocrData.ocr_cnpj || null,
                    comp.id,
                    transacoes || []
                );

                if (result.matches.length > 0) {
                    suggestions.push({
                        comprovante_id: comp.id,
                        comprovante_nome: comp.nome_arquivo,
                        comprovante_valor: valor,
                        comprovante_data: data,
                        status: result.status,
                        reason: result.reason,
                        fraud_score: ocrData.fraud_score || 0,
                        matches: result.matches.map(m => ({
                            transaction_id: m.transaction_id,
                            amount: m.amount,
                            date: m.date,
                            description: m.description,
                            match_score: m.match_score,
                            match_type: m.match_type,
                            confidence: m.confidence
                        })),
                        requires_manual_review: result.requires_manual_review
                    });
                }
            }

            // Calcular estatísticas
            const stats = {
                total_comprovantes_pendentes: comprovantes?.length || 0,
                total_transacoes_pendentes: transacoes?.length || 0,
                total_sugestoes: suggestions.length,
                auto_aprovados: suggestions.filter(s => s.status === 'APPROVED' && !s.requires_manual_review).length,
                manual_review: suggestions.filter(s => s.requires_manual_review).length,
                rejeitados: suggestions.filter(s => s.status === 'REJECTED').length
            };

            return new Response(
                JSON.stringify({
                    stats,
                    suggestions,
                    gap: {
                        transacoes_sem_comprovante: (transacoes || []).filter((t: any) =>
                            !suggestions.some(s => s.matches.some((m: any) => m.transaction_id === t.id))
                        ).length
                    }
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // POST /reconciliation/approve - Aprovar match
        if (req.method === 'POST' && path === 'approve') {
            const body = await req.json();
            const { comprovante_id, transaction_id, actor_id } = body;

            if (!comprovante_id || !transaction_id) {
                return new Response(
                    JSON.stringify({ error: 'comprovante_id e transaction_id são obrigatórios' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Atualizar comprovante
            const { error: compError } = await supabase
                .from('comprovantes')
                .update({
                    status_auditoria: 'aprovado',
                    transacao_vinculada_id: transaction_id,
                    aprovado_em: new Date().toISOString(),
                    aprovado_por: actor_id || 'SYSTEM'
                })
                .eq('id', comprovante_id);

            if (compError) {
                throw new Error(`Erro ao atualizar comprovante: ${compError.message}`);
            }

            // Atualizar transação
            const { error: txError } = await supabase
                .from('transacoes_bancarias')
                .update({
                    status_reconciliacao: 'reconciliado',
                    comprovante_id: comprovante_id,
                    reconciliado_em: new Date().toISOString()
                })
                .eq('id', transaction_id);

            if (txError) {
                throw new Error(`Erro ao atualizar transação: ${txError.message}`);
            }

            // Registrar auditoria
            await auditLogService.logAction({
                entity_type: "reconciliation",
                entity_id: comprovante_id,
                action: "APPROVE",
                actor_id: actor_id || "SYSTEM",
                new_state: {
                    comprovante_id,
                    transaction_id,
                    status: 'aprovado'
                }
            });

            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'Match aprovado com sucesso',
                    comprovante_id,
                    transaction_id
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // POST /reconciliation/reject - Rejeitar match
        if (req.method === 'POST' && path === 'reject') {
            const body = await req.json();
            const { comprovante_id, reason, actor_id } = body;

            if (!comprovante_id) {
                return new Response(
                    JSON.stringify({ error: 'comprovante_id é obrigatório' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Atualizar comprovante
            const { error } = await supabase
                .from('comprovantes')
                .update({
                    status_auditoria: 'rejeitado',
                    motivo_rejeicao: reason || 'Rejeitado manualmente',
                    rejeitado_em: new Date().toISOString(),
                    rejeitado_por: actor_id || 'SYSTEM'
                })
                .eq('id', comprovante_id);

            if (error) {
                throw new Error(`Erro ao rejeitar: ${error.message}`);
            }

            // Registrar auditoria
            await auditLogService.logAction({
                entity_type: "reconciliation",
                entity_id: comprovante_id,
                action: "REJECT",
                actor_id: actor_id || "SYSTEM",
                new_state: {
                    comprovante_id,
                    status: 'rejeitado',
                    reason
                }
            });

            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'Comprovante rejeitado',
                    comprovante_id
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ error: 'Método não permitido' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
