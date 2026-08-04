/**
 * Edge Function: dashboard
 * 
 * Métricas e estatísticas do dashboard:
 * - GET /: Métricas gerais
 * - GET /health: Health check
 * - GET /gaps: Análise de gaps
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    try {
        // GET /dashboard/health - Health check
        if (path === 'health') {
            return new Response(
                JSON.stringify({
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    version: '1.0.0',
                    environment: 'supabase_edge_functions'
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = getSupabaseSecretKey();
        const supabase = createClient(supabaseUrl, supabaseKey);

        const condominioId = url.searchParams.get('condominio_id') || 'default';
        const periodo = url.searchParams.get('periodo') || '30'; // dias

        const dataInicio = new Date();
        dataInicio.setDate(dataInicio.getDate() - parseInt(periodo));
        const dataInicioStr = dataInicio.toISOString().split('T')[0];

        // GET /dashboard/gaps - Análise de gaps
        if (path === 'gaps') {
            // Transações sem comprovante
            const { data: transacoes } = await supabase
                .from('transacoes_bancarias')
                .select('*')
                .eq('condominio_id', condominioId)
                .eq('status_reconciliacao', 'pendente')
                .gte('data_transacao', dataInicioStr);

            // Comprovantes sem transação vinculada
            const { data: comprovantes } = await supabase
                .from('comprovantes')
                .select('*')
                .eq('condominio_id', condominioId)
                .is('transacao_vinculada_id', null)
                .gte('data_upload', dataInicioStr);

            const transacoesSemComprovante = transacoes || [];
            const comprovantesSemTransacao = comprovantes || [];

            const gapCreditos = transacoesSemComprovante
                .filter(t => t.type === 'CREDIT')
                .reduce((s, t) => s + (t.valor || 0), 0);

            const gapDebitos = transacoesSemComprovante
                .filter(t => t.type === 'DEBIT')
                .reduce((s, t) => s + (t.valor || 0), 0);

            return new Response(
                JSON.stringify({
                    periodo_dias: parseInt(periodo),
                    transacoes_sem_comprovante: {
                        total: transacoesSemComprovante.length,
                        creditos: transacoesSemComprovante.filter(t => t.type === 'CREDIT').length,
                        debitos: transacoesSemComprovante.filter(t => t.type === 'DEBIT').length,
                        valor_creditos: gapCreditos,
                        valor_debitos: gapDebitos,
                        lista: transacoesSemComprovante.slice(0, 20)
                    },
                    comprovantes_sem_transacao: {
                        total: comprovantesSemTransacao.length,
                        lista: comprovantesSemTransacao.slice(0, 20)
                    }
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // GET /dashboard - Métricas gerais
        // Transações
        const { data: transacoes, error: txError } = await supabase
            .from('transacoes_bancarias')
            .select('*')
            .eq('condominio_id', condominioId)
            .gte('data_transacao', dataInicioStr);

        // Comprovantes
        const { data: comprovantes, error: compError } = await supabase
            .from('comprovantes')
            .select('*')
            .eq('condominio_id', condominioId)
            .gte('data_upload', dataInicioStr);

        // Calcular métricas
        const txs = transacoes || [];
        const comps = comprovantes || [];

        const creditos = txs.filter(t => t.type === 'CREDIT');
        const debitos = txs.filter(t => t.type === 'DEBIT');

        const totalCreditos = creditos.reduce((s, t) => s + (t.valor || 0), 0);
        const totalDebitos = debitos.reduce((s, t) => s + (t.valor || 0), 0);

        const aprovados = comps.filter(c => c.status_auditoria === 'aprovado');
        const rejeitados = comps.filter(c => c.status_auditoria === 'rejeitado');
        const suspeitos = comps.filter(c => c.status_auditoria === 'suspeito');
        const pendentes = comps.filter(c => c.status_auditoria === 'pendente');
        const auditados = comps.filter(c => c.status_auditoria === 'auditado');

        const reconciliados = txs.filter(t => t.status_reconciliacao === 'reconciliado');
        const txPendentes = txs.filter(t => t.status_reconciliacao === 'pendente');

        // Fraudes detectadas
        const altaFraude = comps.filter(c => (c.ocr_data?.fraud_score || 0) > 50);

        return new Response(
            JSON.stringify({
                condominio_id: condominioId,
                periodo_dias: parseInt(periodo),

                financeiro: {
                    receitas: {
                        total: totalCreditos,
                        quantidade: creditos.length
                    },
                    despesas: {
                        total: totalDebitos,
                        quantidade: debitos.length
                    },
                    saldo: totalCreditos - totalDebitos
                },

                transacoes: {
                    total: txs.length,
                    reconciliados: reconciliados.length,
                    pendentes: txPendentes.length,
                    taxa_reconciliacao: txs.length > 0
                        ? ((reconciliados.length / txs.length) * 100).toFixed(1) + '%'
                        : '0%'
                },

                comprovantes: {
                    total: comps.length,
                    aprovados: aprovados.length,
                    rejeitados: rejeitados.length,
                    suspeitos: suspeitos.length,
                    pendentes: pendentes.length,
                    auditados: auditados.length
                },

                fraude: {
                    alertas: altaFraude.length,
                    score_medio: comps.length > 0
                        ? (comps.reduce((s, c) => s + (c.ocr_data?.fraud_score || 0), 0) / comps.length).toFixed(1)
                        : 0
                },

                gap: {
                    transacoes_sem_comprovante: txPendentes.length,
                    valor_gap: txPendentes.reduce((s, t) => s + (t.valor || 0), 0)
                },

                timestamp: new Date().toISOString()
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
