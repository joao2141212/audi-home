const pg = require('pg');

const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function fixAuthSchema() {
    console.log('🔧 VERIFICANDO E CORRIGINDO SCHEMA AUTH\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        // 1. Verificar RLS em todas as tabelas auth
        console.log('1. Status RLS em tabelas auth:');
        const rlsRes = await client.query(`
            SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity 
            FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = 'auth' AND c.relkind = 'r'
            ORDER BY c.relname
        `);
        rlsRes.rows.forEach(r => console.log(`   - ${r.relname}: RLS=${r.relrowsecurity}, Force=${r.relforcerowsecurity}`));

        // 2. Desativar RLS em users e identities (tabelas críticas para login)
        console.log('\n2. Desativando RLS em auth.users...');
        try {
            await client.query(`ALTER TABLE auth.users DISABLE ROW LEVEL SECURITY`);
            console.log('   ✅ auth.users RLS desativado');
        } catch (e) {
            console.log(`   ❌ erro: ${e.message}`);
        }

        console.log('\n3. Desativando RLS em auth.identities...');
        try {
            await client.query(`ALTER TABLE auth.identities DISABLE ROW LEVEL SECURITY`);
            console.log('   ✅ auth.identities RLS desativado');
        } catch (e) {
            console.log(`   ❌ erro: ${e.message}`);
        }

        console.log('\n4. Desativando RLS em auth.sessions...');
        try {
            await client.query(`ALTER TABLE auth.sessions DISABLE ROW LEVEL SECURITY`);
            console.log('   ✅ auth.sessions RLS desativado');
        } catch (e) {
            console.log(`   ❌ erro: ${e.message}`);
        }

        console.log('\n5. Desativando RLS em auth.refresh_tokens...');
        try {
            await client.query(`ALTER TABLE auth.refresh_tokens DISABLE ROW LEVEL SECURITY`);
            console.log('   ✅ auth.refresh_tokens RLS desativado');
        } catch (e) {
            console.log(`   ❌ erro: ${e.message}`);
        }

        // 3. Verificar novamente
        console.log('\n6. Status após correção:');
        const checkRes = await client.query(`
            SELECT c.relname, c.relrowsecurity
            FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = 'auth' AND c.relkind = 'r'
            AND c.relname IN ('users', 'identities', 'sessions', 'refresh_tokens')
        `);
        checkRes.rows.forEach(r => console.log(`   - ${r.relname}: RLS=${r.relrowsecurity}`));

        console.log('\n✅ Correções aplicadas. Teste o login novamente.');

    } catch (e) {
        console.error('❌ Erro geral:', e.message);
    } finally {
        await client.end();
    }
}

fixAuthSchema();
