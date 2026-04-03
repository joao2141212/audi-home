/**
 * Edge Function: transactions
 * 
 * CRUD de transações bancárias:
 * - GET: Listar transações
 * - POST: Adicionar transação manual
 * - GET /sync: Sincronizar com Pluggy
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PluggyClient } from "../_shared/pluggy-client.ts";

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

        // GET /transactions - Listar transações
        if (req.method === 'GET' && path !== 'sync') {
            const condominioId = url.searchParams.get('condominio_id') || 'default';
            const limit = parseInt(url.searchParams.get('limit') || '100');
            const status = url.searchParams.get('status');
            const typeParam = url.searchParams.get('type');
            const from = url.searchParams.get('from');
            const to = url.searchParams.get('to');

            let query = supabase
                .from('transacoes_bancarias')
                .select('*')
                .eq('condominio_id', condominioId)
                .order('data_transacao', { ascending: false })
                .limit(limit);

            if (status) {
                query = query.eq('status_reconciliacao', status);
            }

            if (typeParam) {
                query = query.eq('type', typeParam.toUpperCase());
            }

            if (from) {
                query = query.gte('data_transacao', from);
            }

            if (to) {
                query = query.lte('data_transacao', to);
            }

            const { data: transacoes, error } = await query;

            if (error) {
                throw new Error(`Erro ao buscar transações: ${error.message}`);
            }

            // Calcular resumo
            const resumo = {
                total: transacoes?.length || 0,
                creditos: transacoes?.filter(t => t.type === 'CREDIT').length || 0,
                debitos: transacoes?.filter(t => t.type === 'DEBIT').length || 0,
                pendentes: transacoes?.filter(t => t.status_reconciliacao === 'pendente').length || 0,
                reconciliados: transacoes?.filter(t => t.status_reconciliacao === 'reconciliado').length || 0,
                total_creditos: transacoes?.filter(t => t.type === 'CREDIT').reduce((s, t) => s + (t.valor || 0), 0) || 0,
                total_debitos: transacoes?.filter(t => t.type === 'DEBIT').reduce((s, t) => s + (t.valor || 0), 0) || 0
            };

            return new Response(
                JSON.stringify({
                    resumo,
                    transacoes: transacoes || [],
                    condominio_id: condominioId
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // POST /transactions - Adicionar transação manual
        if (req.method === 'POST' && path !== 'sync') {
            const body = await req.json();

            const { condominio_id, data_transacao, descricao, valor, type: typeValue } = body;

            if (!condominio_id || !data_transacao || !valor) {
                return new Response(
                    JSON.stringify({ error: 'condominio_id, data_transacao e valor são obrigatórios' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const transactionId = `tx_manual_${Date.now()}`;
            const timestamp = new Date().toISOString();

            const { error } = await supabase
                .from('transacoes_bancarias')
                .insert({
                    id: transactionId,
                    condominio_id,
                    data_transacao,
                    descricao: descricao || 'Transação manual',
                    valor: Math.abs(valor),
                    type: typeValue?.toUpperCase() || (valor >= 0 ? 'CREDIT' : 'DEBIT'),
                    fonte: 'manual',
                    status_reconciliacao: 'pendente',
                    criado_em: timestamp
                });

            if (error) {
                throw new Error(`Erro ao inserir: ${error.message}`);
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    id: transactionId,
                    message: 'Transação adicionada com sucesso'
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // GET /transactions/sync - Sincronizar com Pluggy
        if (path === 'sync') {
            const condominioId = url.searchParams.get('condominio_id') || 'default';

            // Buscar contas conectadas
            const { data: contas, error: contasError } = await supabase
                .from('condominio_contas_bancarias')
                .select('*')
                .eq('condominio_id', condominioId)
                .eq('ativo', true);

            if (contasError) {
                throw new Error(`Erro ao buscar contas: ${contasError.message}`);
            }

            if (!contas || contas.length === 0) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        message: 'Nenhuma conta bancária conectada',
                        condominio_id: condominioId
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const pluggy = new PluggyClient();
            let totalFetched = 0;
            let totalInserted = 0;
            const timestamp = new Date().toISOString();

            for (const conta of contas) {
                try {
                    const transactions = await pluggy.getTransactions(conta.pluggy_account_id);
                    totalFetched += transactions.length;

                    for (const tx of transactions) {
                        const { error } = await supabase
                            .from('transacoes_bancarias')
                            .upsert({
                                id: tx.id,
                                condominio_id: condominioId,
                                data_transacao: tx.date.split('T')[0],
                                descricao: tx.description,
                                valor: Math.abs(tx.amount),
                                type: tx.amount >= 0 ? 'CREDIT' : 'DEBIT',
                                fonte: 'pluggy',
                                status_reconciliacao: 'pendente',
                                conta_bancaria_id: conta.id,
                                criado_em: timestamp
                            }, { onConflict: 'id' });

                        if (!error) totalInserted++;
                    }
                } catch (e: any) {
                    console.error(`Erro ao sincronizar conta ${conta.id}:`, e.message);
                }
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    contas_sincronizadas: contas.length,
                    transacoes_obtidas: totalFetched,
                    transacoes_inseridas: totalInserted,
                    condominio_id: condominioId
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
