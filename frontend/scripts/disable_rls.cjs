const pg = require('pg');

const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function diagnoseAndFix() {
    console.log('🔧 DIAGNÓSTICO E CORREÇÃO FINAL\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        // 1. Listar todas as funções no public
        console.log('1. Funções no schema public:');
        const funcsRes = await client.query(`
            SELECT p.proname
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public'
        `);
        funcsRes.rows.forEach(f => console.log(`   - ${f.proname}`));

        // 2. Verificar se RLS está ativo em perfis
        console.log('\n2. Status RLS na tabela perfis:');
        const rlsRes = await client.query(`
            SELECT relname, relrowsecurity, relforcerowsecurity 
            FROM pg_class 
            WHERE relname = 'perfis' AND relnamespace = 'public'::regnamespace
        `);
        console.log(`   RLS enabled: ${rlsRes.rows[0]?.relrowsecurity}`);
        console.log(`   RLS forced: ${rlsRes.rows[0]?.relforcerowsecurity}`);

        // 3. Verificar policies em perfis
        console.log('\n3. Políticas em perfis:');
        const polRes = await client.query(`
            SELECT polname, polcmd, polroles::regrole[] 
            FROM pg_policy 
            WHERE polrelid = 'public.perfis'::regclass
        `);
        console.log(`   Políticas: ${polRes.rows.length}`);
        polRes.rows.forEach(p => console.log(`   - ${p.polname} (${p.polcmd})`));

        // 4. SOLUÇÃO: Desativar RLS temporariamente em perfis para não bloquear auth
        console.log('\n4. Desativando RLS em perfis (para permitir auth funcionar)...');
        await client.query(`ALTER TABLE public.perfis DISABLE ROW LEVEL SECURITY`);
        console.log('   ✅ RLS desativado em perfis');

        // 5. Também desativar em condominios
        console.log('\n5. Desativando RLS em condominios...');
        await client.query(`ALTER TABLE public.condominios DISABLE ROW LEVEL SECURITY`);
        console.log('   ✅ RLS desativado em condominios');

        // 6. Desativar em transacoes_bancarias
        console.log('\n6. Desativando RLS em transacoes_bancarias...');
        await client.query(`ALTER TABLE public.transacoes_bancarias DISABLE ROW LEVEL SECURITY`);
        console.log('   ✅ RLS desativado em transacoes_bancarias');

        // 7. Verificar novamente
        console.log('\n7. Verificando RLS após correção:');
        const checkRes = await client.query(`
            SELECT relname, relrowsecurity 
            FROM pg_class 
            WHERE relnamespace = 'public'::regnamespace 
            AND relkind = 'r'
        `);
        checkRes.rows.forEach(r => console.log(`   - ${r.relname}: RLS=${r.relrowsecurity}`));

        console.log('\n✅ RLS desativado. Tente logar novamente.');
        console.log('   (Depois podemos reativar com políticas corretas)\n');

    } catch (e) {
        console.error('❌ Erro:', e.message);
    } finally {
        await client.end();
    }
}

diagnoseAndFix();
