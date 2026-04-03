/**
 * Edge Function: open-finance
 * 
 * Integração com Pluggy (Open Finance):
 * - Criar Connect Token para widget
 * - Salvar conexão bancária
 * - Sincronizar transações
 * - Buscar saldo
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PluggyClient, OpenFinanceService } from "../_shared/pluggy-client.ts";

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

        const pluggy = new PluggyClient();
        const openFinance = new OpenFinanceService('pluggy');

        // POST /open-finance/connect - Criar Connect Token
        if (req.method === 'POST' && (path === 'connect' || path === 'open-finance')) {
            const body = await req.json();
            const userId = body.user_id || body.condominio_id || 'default';

            console.log(`[Open Finance] Criando Connect Token para ${userId}...`);

            const result = await openFinance.createBankConnection(userId);

            return new Response(
                JSON.stringify({
                    success: true,
                    connect_token: result.access_token,
                    widget_url: result.widget_url
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // POST /open-finance/save-connection - Salvar conexão após autorização
        if (req.method === 'POST' && path === 'save-connection') {
            const body = await req.json();
            const { item_id, condominio_id } = body;

            if (!item_id || !condominio_id) {
                return new Response(
                    JSON.stringify({ error: 'item_id e condominio_id são obrigatórios' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            console.log(`[Open Finance] Salvando conexão: item=${item_id}, condo=${condominio_id}`);

            // Buscar contas do item
            const accounts = await pluggy.getAccounts(item_id);

            // Salvar no Supabase
            for (const account of accounts) {
                const { error } = await supabase
                    .from('condominio_contas_bancarias')
                    .upsert({
                        id: `${condominio_id}_${account.id}`,
                        condominio_id,
                        pluggy_item_id: item_id,
                        pluggy_account_id: account.id,
                        banco_nome: account.name || 'Banco',
                        conta_numero: account.number || '',
                        tipo_conta: account.type || 'CHECKING',
                        ativo: true,
                        criado_em: new Date().toISOString()
                    }, { onConflict: 'id' });

                if (error) {
                    console.error(`Erro ao salvar conta: ${error.message}`);
                }
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    item_id,
                    accounts_saved: accounts.length,
                    accounts: accounts.map(a => ({
                        id: a.id,
                        name: a.name,
                        number: a.number
                    }))
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // GET /open-finance/sync/{account_id} ou POST /open-finance/sync
        if (path === 'sync' || path?.startsWith('sync-')) {
            let accountId: string;
            let condominioId: string;

            if (req.method === 'GET') {
                accountId = url.searchParams.get('account_id') || '';
                condominioId = url.searchParams.get('condominio_id') || 'default';
            } else {
                const body = await req.json();
                accountId = body.account_id;
                condominioId = body.condominio_id || 'default';
            }

            if (!accountId) {
                return new Response(
                    JSON.stringify({ error: 'account_id é obrigatório' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            console.log(`[Open Finance] Sincronizando transações da conta ${accountId}...`);

            const transactions = await openFinance.syncTransactions(accountId, 30);

            // Salvar transações no Supabase
            const timestamp = new Date().toISOString();
            let inserted = 0;

            for (const tx of transactions) {
                const { error } = await supabase
                    .from('transacoes_bancarias')
                    .upsert({
                        id: tx.id,
                        condominio_id: condominioId,
                        data_transacao: tx.date,
                        descricao: tx.description,
                        valor: tx.amount,
                        type: tx.type,
                        fonte: 'pluggy',
                        status_reconciliacao: 'pendente',
                        criado_em: timestamp,
                        metadata: tx.metadata
                    }, { onConflict: 'id' });

                if (!error) inserted++;
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    account_id: accountId,
                    transactions_fetched: transactions.length,
                    transactions_inserted: inserted,
                    transactions: transactions.slice(0, 10) // Preview
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // GET /open-finance/balance/{account_id}
        if (path === 'balance' || path?.startsWith('balance-')) {
            const accountId = url.searchParams.get('account_id');

            if (!accountId) {
                return new Response(
                    JSON.stringify({ error: 'account_id é obrigatório' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const balance = await openFinance.getRealTimeBalance(accountId);

            return new Response(
                JSON.stringify({
                    success: true,
                    account_id: accountId,
                    balance,
                    timestamp: new Date().toISOString()
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // GET /open-finance/connectors - Listar bancos disponíveis
        if (path === 'connectors') {
            const connectors = await pluggy.getConnectors(true);

            return new Response(
                JSON.stringify({
                    success: true,
                    count: connectors.length,
                    connectors: connectors.slice(0, 20) // Preview
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Rota não encontrada
        return new Response(
            JSON.stringify({
                error: 'Rota não encontrada',
                available_routes: [
                    'POST /connect - Criar Connect Token',
                    'POST /save-connection - Salvar conexão',
                    'GET /sync?account_id=xxx - Sincronizar transações',
                    'GET /balance?account_id=xxx - Buscar saldo',
                    'GET /connectors - Listar bancos'
                ]
            }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
