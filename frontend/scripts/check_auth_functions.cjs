const pg = require('pg');

const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function checkAuthFunctions() {
    console.log('🔬 VERIFICANDO FUNÇÕES AUTH\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        // 1. Listar funções no schema auth
        console.log('1. Funções no schema auth:');
        const funcsRes = await client.query(`
            SELECT p.proname, pg_get_function_arguments(p.oid) as args
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'auth'
        `);
        funcsRes.rows.forEach(f => console.log(`   - auth.${f.proname}(${f.args})`));

        // 2. Verificar se as funções auth.uid, auth.role, auth.email existem
        console.log('\n2. Testando funções auth...');

        try {
            await client.query(`SELECT auth.uid()`);
            console.log('   auth.uid() - ✅ existe');
        } catch (e) {
            console.log(`   auth.uid() - ❌ erro: ${e.message}`);
        }

        try {
            await client.query(`SELECT auth.role()`);
            console.log('   auth.role() - ✅ existe');
        } catch (e) {
            console.log(`   auth.role() - ❌ erro: ${e.message}`);
        }

        try {
            await client.query(`SELECT auth.email()`);
            console.log('   auth.email() - ✅ existe');
        } catch (e) {
            console.log(`   auth.email() - ❌ erro: ${e.message}`);
        }

        try {
            await client.query(`SELECT auth.jwt()`);
            console.log('   auth.jwt() - ✅ existe');
        } catch (e) {
            console.log(`   auth.jwt() - ❌ erro: ${e.message}`);
        }

        // 3. Verificar se há search_path correto
        console.log('\n3. Verificando search_path...');
        const pathRes = await client.query(`SHOW search_path`);
        console.log(`   search_path: ${pathRes.rows[0].search_path}`);

        // 4. Verificar configurações do auth schema
        console.log('\n4. Verificando privilégios do schema auth...');
        const privRes = await client.query(`
            SELECT grantee, privilege_type 
            FROM information_schema.schema_privileges 
            WHERE schema_name = 'auth'
        `);
        privRes.rows.forEach(p => console.log(`   - ${p.grantee}: ${p.privilege_type}`));

        // 5. Verificar se o supabase_auth_admin tem acesso
        console.log('\n5. Verificando roles...');
        const rolesRes = await client.query(`
            SELECT rolname FROM pg_roles 
            WHERE rolname LIKE '%auth%' OR rolname LIKE '%supabase%'
        `);
        rolesRes.rows.forEach(r => console.log(`   - ${r.rolname}`));

        // 6. Testar query direta que o GoTrue pode fazer
        console.log('\n6. Testando query do GoTrue (identities join)...');
        try {
            const testRes = await client.query(`
                SELECT u.*, i.* 
                FROM auth.users u
                LEFT JOIN auth.identities i ON i.user_id = u.id
                WHERE u.email = 'master@audi.home'
            `);
            console.log(`   ✅ Query OK, ${testRes.rows.length} resultado(s)`);
        } catch (e) {
            console.log(`   ❌ erro: ${e.message}`);
        }

        console.log('\n✅ Verificação concluída.');

    } catch (e) {
        console.error('❌ Erro:', e.message);
    } finally {
        await client.end();
    }
}

checkAuthFunctions();
