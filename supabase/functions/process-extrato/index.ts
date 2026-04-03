/**
 * Edge Function: process-extrato
 * 
 * Processa upload de extratos bancários:
 * 1. Recebe PDF/CSV
 * 2. Extrai transações com Gemini ou Parser nativo
 * 3. Salva no Supabase
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { StatementParser } from "../_shared/statement-parser.ts";

declare const Deno: any;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============== GEMINI AI - EXTRAIR TRANSAÇÕES ==============
async function extractTransactionsWithGemini(base64Content: string, mimeType: string): Promise<{
    transacoes: Array<{
        data: string;
        descricao: string;
        valor: number;
        tipo: 'CREDIT' | 'DEBIT';
    }>;
    periodo_inicio: string | null;
    periodo_fim: string | null;
    tokens_used: number;
}> {
    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    if (!apiKey) {
        throw new Error('GOOGLE_API_KEY não configurada');
    }

    const prompt = `Você é um parser de extratos bancários brasileiros.
Analise este documento e extraia TODAS as transações financeiras.

Retorne APENAS JSON (sem markdown, sem \`\`\`):
{
  "transacoes": [
    {
      "data": "YYYY-MM-DD",
      "descricao": "descrição da transação",
      "valor": -1500.00,
      "tipo": "DEBIT"
    }
  ],
  "periodo_inicio": "YYYY-MM-DD",
  "periodo_fim": "YYYY-MM-DD"
}

REGRAS:
- Valor NEGATIVO = débito (pagamentos, saídas)
- Valor POSITIVO = crédito (recebimentos, entradas)
- tipo: "DEBIT" para saídas, "CREDIT" para entradas
- Ignore cabeçalhos, saldos e linhas que não são transações
- Data no formato YYYY-MM-DD`;

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: mimeType, data: base64Content } }
                    ]
                }]
            })
        }
    );

    const result = await response.json();

    const tokens = (result.usageMetadata?.promptTokenCount || 0) +
        (result.usageMetadata?.candidatesTokenCount || 0);

    if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
        const jsonText = result.candidates[0].content.parts[0].text
            .replace(/```json\s*/g, '')
            .replace(/```/g, '')
            .trim();

        try {
            const parsed = JSON.parse(jsonText);
            return { ...parsed, tokens_used: tokens };
        } catch (e) {
            console.error("Falha ao parsear JSON:", e);
        }
    }

    return {
        transacoes: [],
        periodo_inicio: null,
        periodo_fim: null,
        tokens_used: tokens
    };
}

// ============== MAIN HANDLER ==============
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
        const mimeType = file.type || 'application/pdf';
        const fileName = file.name.toLowerCase();

        console.log(`📤 Processando extrato: ${file.name} (${bytes.length} bytes)`);

        // Inicializar Supabase
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        let resultado: any;
        let metodo = '';

        // Tentar parser nativo primeiro (CSV, OFX)
        if (fileName.endsWith('.csv')) {
            console.log('📄 Usando parser CSV nativo...');
            const parser = new StatementParser();
            const content = new TextDecoder().decode(bytes);
            const parseResult = parser.parseCSV(content);
            parseResult.file_hash = await parser.calculateFileHash(bytes);

            resultado = {
                transacoes: parseResult.transactions.map(tx => ({
                    data: tx.data_transacao,
                    descricao: tx.descricao,
                    valor: tx.valor,
                    tipo: tx.tipo.toUpperCase()
                })),
                periodo_inicio: parseResult.periodo_inicio,
                periodo_fim: parseResult.periodo_fim,
                tokens_used: 0
            };
            metodo = 'parser_csv';
        } else if (fileName.endsWith('.ofx')) {
            console.log('📄 Usando parser OFX nativo...');
            const parser = new StatementParser();
            const content = new TextDecoder('latin1').decode(bytes);
            const parseResult = parser.parseOFX(content);
            parseResult.file_hash = await parser.calculateFileHash(bytes);

            resultado = {
                transacoes: parseResult.transactions.map(tx => ({
                    data: tx.data_transacao,
                    descricao: tx.descricao,
                    valor: tx.valor,
                    tipo: tx.tipo
                })),
                periodo_inicio: parseResult.periodo_inicio,
                periodo_fim: parseResult.periodo_fim,
                tokens_used: 0
            };
            metodo = 'parser_ofx';
        } else {
            // PDF ou imagem -> usar Gemini
            console.log('🤖 Usando Gemini para extração...');
            const base64 = btoa(String.fromCharCode(...bytes));
            resultado = await extractTransactionsWithGemini(base64, mimeType);
            metodo = 'gemini_ai';
        }

        console.log(`✅ Extraídas ${resultado.transacoes.length} transações`);

        // Calcular hash para evitar duplicatas
        const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Inserir extrato
        const extratoId = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        const { error: extratoError } = await supabase
            .from('extratos_bancarios')
            .insert({
                id: extratoId,
                condominio_id: condominioId,
                arquivo_nome: file.name,
                arquivo_hash: fileHash,
                periodo_inicio: resultado.periodo_inicio || null,
                periodo_fim: resultado.periodo_fim || null,
                fonte: 'manual'
            });

        // Inserir transações
        const transacoesParaInserir = resultado.transacoes.map((tx: any, i: number) => ({
            id: crypto.randomUUID(),
            condominio_id: condominioId,
            extrato_id: extratoId,
            data_transacao: tx.data,
            descricao: tx.descricao,
            valor: Math.abs(tx.valor),
            type: tx.tipo,
            conciliado: false
        }));

        let transacoesInseridas = 0;
        if (transacoesParaInserir.length > 0) {
            const { error: txError } = await supabase
                .from('transacoes_bancarias')
                .insert(transacoesParaInserir);

            if (!txError) {
                transacoesInseridas = transacoesParaInserir.length;
            } else {
                console.error("Erro ao inserir transações:", txError);
            }
        }

        const processingTime = Date.now() - startTime;

        // Retornar resposta
        return new Response(
            JSON.stringify({
                id: extratoId,
                status: 'importado',

                transacoes: {
                    total: resultado.transacoes.length,
                    inseridas: transacoesInseridas,
                    lista: resultado.transacoes.slice(0, 10)
                },

                periodo: {
                    inicio: resultado.periodo_inicio,
                    fim: resultado.periodo_fim
                },

                resumo: {
                    total_creditos: resultado.transacoes
                        .filter((t: any) => t.tipo === 'CREDIT')
                        .reduce((sum: number, t: any) => sum + Math.abs(t.valor), 0),
                    total_debitos: resultado.transacoes
                        .filter((t: any) => t.tipo === 'DEBIT')
                        .reduce((sum: number, t: any) => sum + Math.abs(t.valor), 0)
                },

                processamento: {
                    metodo,
                    modelo: metodo === 'gemini_ai' ? 'gemini-2.5-flash' : 'parser_nativo',
                    tokens_usados: resultado.tokens_used,
                    tempo_ms: processingTime
                },

                armazenamento: {
                    local: 'Supabase PostgreSQL',
                    tabela_extrato: 'extratos_bancarios',
                    tabela_transacoes: 'transacoes_bancarias',
                    extrato_id: extratoId,
                    hash: fileHash.substring(0, 16) + '...',
                    timestamp: timestamp,
                    persistente: true,
                    erro: extratoError?.message || null
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('❌ Erro:', error);
        return new Response(
            JSON.stringify({
                error: error?.message || 'Erro interno',
                stack: error?.stack
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
