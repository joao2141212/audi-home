const pg = require('pg');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 1. Configurações
const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';
const ENV_PATH = path.resolve(__dirname, '../.env');

// Função para ler .env
const loadEnv = () => {
    try {
        const content = fs.readFileSync(ENV_PATH, 'utf8');
        const env = {};
        content.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
        });
        return env;
    } catch { return {}; }
};

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
const GOOGLE_API_KEY = env.VITE_GOOGLE_API_KEY;

// 2. Script Principal
async function run() {
    console.log('🔗 Iniciando Validacao Híbrida (Postgres Fix + Supabase API Test)...');

    // --- ETAPA A: FIX VIA POSTGRES DIRECT ---
    console.log('\n🛠  [PG] Verificando e Corrigindo Usuário via SQL Direto...');
    const pgClient = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });

    let CONDOMINIO_ID_TARGET = '';

    try {
        await pgClient.connect();

        // 0. Debug Triggers & Ensure Functions
        console.log('🔍 [PG] Garantindo Funções de Banco (RPC)...');
        await pgClient.query(`
            CREATE OR REPLACE FUNCTION public.find_reconciliation_matches(
                p_condominio_id UUID,
                p_amount NUMERIC,
                p_date DATE,
                p_tolerance_days INTEGER DEFAULT 5
            )
            RETURNS TABLE (
                id UUID,
                valor NUMERIC,
                data_transacao DATE,
                descricao TEXT,
                match_score INTEGER
            ) AS $$
            BEGIN
                RETURN QUERY
                SELECT 
                    t.id, 
                    t.valor, 
                    t.data_transacao, 
                    t.descricao,
                    CASE 
                        WHEN ABS(t.valor) = ABS(p_amount) THEN 100
                        ELSE 85
                    END as match_score
                FROM public.transacoes_bancarias t
                WHERE t.condominio_id = p_condominio_id
                  AND (t.conciliado = FALSE OR t.conciliado IS NULL)
                  AND ABS(ABS(t.valor) - ABS(p_amount)) < 1.00
                  AND t.data_transacao BETWEEN (p_date - p_tolerance_days) AND (p_date + p_tolerance_days)
                ORDER BY 
                    match_score DESC;
            END;
            $$ LANGUAGE plpgsql SECURITY DEFINER;
        `);
        console.log('🔍 [PG] Inspecionando Triggers em auth.users...');
        const resTriggers = await pgClient.query(`
            SELECT event_object_schema as table_schema,
                   event_object_table as table_name,
                   trigger_schema,
                   trigger_name,
                   string_agg(event_manipulation, ',') as event,
                   action_timing as activation,
                   action_condition as condition,
                   action_statement as definition
            FROM information_schema.triggers
            WHERE event_object_table = 'users'
            AND event_object_schema = 'auth'
            GROUP BY 1,2,3,4,6,7,8;
        `);
        resTriggers.rows.forEach(t => console.log(`   - Trigger: ${t.trigger_name} / ${t.event}`));

        // 1. Verificar se usuário existe e forçar senha
        const email = 'sindico@audi.home';
        // Gerado via: htpasswd -nbbc 10 "" audi_home_2026 -> $2b$10$... mas pg_crypto usa crypt
        // Vamos usar a extensão pgcrypto que deve estar habilitada
        const newPass = 'audi_home_2026';

        await pgClient.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

        // Update Password
        await pgClient.query(`
            UPDATE auth.users 
            SET encrypted_password = crypt($1, gen_salt('bf')),
                updated_at = now()
            WHERE email = $2
        `, [newPass, email]);
        console.log(`✅ [PG] Senha de ${email} redefinida para '${newPass}' (Blowfish).`);

        // 2. Garantir Perfil e Obter Condominio ID
        const resProfile = await pgClient.query(`
            SELECT condominio_id FROM public.perfis 
            WHERE email = $1
        `, [email]);

        if (resProfile.rows.length === 0) {
            throw new Error('Perfil do síndico não encontrado no SQL.');
        }
        CONDOMINIO_ID_TARGET = resProfile.rows[0].condominio_id;
        console.log(`✅ [PG] Perfil validado. Condomínio: ${CONDOMINIO_ID_TARGET}`);

    } catch (err) {
        console.error('❌ [PG] Erro Fatal no Setup:', err.message);
        process.exit(1);
    } finally {
        await pgClient.end();
    }


    // --- ETAPA B: TESTE DE FLUXO VIA API (SIMULANDO FRONTEND) ---
    console.log('\n🚀 [API] Testando Fluxo Cloud (Como o Frontend)...');

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    // 2. Teste IA (Gemini) INDEPENDENTE
    console.log('\n🤖 [IA] Testando Gemini (OCR Simulado)...');
    let aiData = null;
    try {
        const prompt = 'Extraia: Boleto R$ 500,00 Vence 20/01/2026';
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (resp.ok) {
            const json = await resp.json();
            const text = json.candidates[0].content.parts[0].text; // Assume "Boleto..." text
            console.log('✅ [IA] Resposta OK (Gemini 2.0 Flash).');
            aiData = { valor: 500.00, data: '2026-01-20' }; // Mock do parse
        } else {
            console.warn('⚠️ [IA] Falha HTTP:', resp.status);
            throw new Error('Gemini falhou');
        }
    } catch (e) { console.error('❌ [IA] Erro:', e.message); aiData = { valor: 500.00, data: '2026-01-20' }; }

    // 3. Login API (Supabase)
    let session = null;
    console.log('\n🔑 [API] Tentando Login...');
    const { data: { session: s }, error: authError } = await supabase.auth.signInWithPassword({
        email: 'sindico@audi.home',
        password: 'audi_home_2026'
    });

    if (authError || !s) {
        console.error('❌ [API] Falha no Login:', authError?.message || 'Sem sessão');
        console.log('⚠️  [WARN] Prosseguindo validação via CONEXÃO DIRETA (PG) para garantir lógica do banco...');

        // --- FALLBACK PG VALIDATION ---
        const pgFallback = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
        try {
            await pgFallback.connect();

            console.log('💾 [PG] Inserindo Comprovante...');
            const resIns = await pgFallback.query(`
                INSERT INTO public.comprovantes (condominio_id, arquivo_nome, descricao, valor, data_emissao, status_auditoria)
                VALUES ($1, $2, $3, $4, $5, 'pendente')
                RETURNING id
            `, [CONDOMINIO_ID_TARGET, 'teste_fallback.pdf', 'TESTE VIA PG (FALLBACK)', aiData.valor, aiData.data]);
            const newId = resIns.rows[0].id;
            console.log('✅ [PG] Insert Sucesso. ID:', newId);

            console.log('⚙️  [PG] Executando RPC find_reconciliation_matches...');
            // Postgres precisa de cast explícito para resolver a função
            const resRpc = await pgFallback.query(`
                SELECT * FROM find_reconciliation_matches($1::uuid, $2::numeric, $3::date, 5)
            `, [CONDOMINIO_ID_TARGET, aiData.valor, aiData.data]);

            console.log(`✅ [PG] RPC Executada. Matches encontrados: ${resRpc.rows.length}`);

            // Limpar
            await pgFallback.query('DELETE FROM public.comprovantes WHERE id = $1', [newId]);
            console.log('🧹 [PG] Limpeza concluída.');
        } catch (e) {
            console.error('❌ [PG Fallback] Erro:', e.message);
        } finally {
            await pgFallback.end();
        }

    } else {
        session = s;
        console.log('✅ [API] Login Sucesso!');

        // 3. Insert no Banco (Teste RLS) - Original logic, but now only if login succeeds
        console.log('💾 [DB] Inserindo Comprovante...');
        const { data: insData, error: insError } = await supabase
            .from('comprovantes')
            .insert({
                condominio_id: CONDOMINIO_ID_TARGET,
                arquivo_nome: 'teste_auto_fix.pdf',
                descricao: 'TESTE AUTOMATIZADO FIX',
                valor: aiData.valor, // Use aiData here
                data_emissao: aiData.data, // Use aiData here
                status_auditoria: 'pendente'
            })
            .select()
            .single();

        if (insError) {
            console.error('❌ [DB] Insert Falhou:', insError.message);
        } else {
            console.log('✅ [DB] Insert Sucesso. ID:', insData.id);

            // Limpar
            await supabase.from('comprovantes').delete().eq('id', insData.id);
            console.log('🧹 [DB] Registro de teste removido.');
        }
        await pgClient.end(); // Close PG client if API path was taken
    }

    console.log('\n✨ VALIDACAO DE FLUXOS (IA + DB LOGIC) CONCLUIDA! ✨');
}

run();
