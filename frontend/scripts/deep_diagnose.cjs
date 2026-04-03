const pg = require('pg');

const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function deepDiagnose() {
    console.log('🔬 DIAGNÓSTICO PROFUNDO DO SCHEMA AUTH\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        // 1. Listar todas as tabelas no schema auth
        console.log('1. Tabelas no schema auth:');
        const tablesRes = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'auth' ORDER BY table_name
        `);
        tablesRes.rows.forEach(t => console.log(`   - ${t.table_name}`));

        // 2. Verificar estrutura de auth.users
        console.log('\n2. Colunas de auth.users:');
        const colsRes = await client.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_schema = 'auth' AND table_name = 'users'
            ORDER BY ordinal_position
        `);
        colsRes.rows.forEach(c => console.log(`   - ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable})`));

        // 3. Verificar estrutura de auth.identities
        console.log('\n3. Colunas de auth.identities:');
        const idColsRes = await client.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_schema = 'auth' AND table_name = 'identities'
            ORDER BY ordinal_position
        `);
        idColsRes.rows.forEach(c => console.log(`   - ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable})`));

        // 4. Verificar dados do usuário master completo
        console.log('\n4. Dados completos do usuário master:');
        const masterRes = await client.query(`SELECT * FROM auth.users WHERE email = 'master@audi.home'`);
        if (masterRes.rows[0]) {
            const u = masterRes.rows[0];
            console.log(`   id: ${u.id}`);
            console.log(`   email: ${u.email}`);
            console.log(`   encrypted_password exists: ${!!u.encrypted_password}`);
            console.log(`   encrypted_password length: ${u.encrypted_password?.length}`);
            console.log(`   email_confirmed_at: ${u.email_confirmed_at}`);
            console.log(`   aud: ${u.aud}`);
            console.log(`   role: ${u.role}`);
            console.log(`   raw_app_meta_data: ${JSON.stringify(u.raw_app_meta_data)}`);
            console.log(`   raw_user_meta_data: ${JSON.stringify(u.raw_user_meta_data)}`);
            console.log(`   is_sso_user: ${u.is_sso_user}`);
            console.log(`   deleted_at: ${u.deleted_at}`);
        }

        // 5. Verificar identidade do master
        console.log('\n5. Identidade do master:');
        const idRes = await client.query(`SELECT * FROM auth.identities WHERE provider_id = (SELECT id::text FROM auth.users WHERE email = 'master@audi.home')`);
        if (idRes.rows[0]) {
            const i = idRes.rows[0];
            console.log(`   id: ${i.id}`);
            console.log(`   user_id: ${i.user_id}`);
            console.log(`   provider: ${i.provider}`);
            console.log(`   provider_id: ${i.provider_id}`);
            console.log(`   identity_data: ${JSON.stringify(i.identity_data)}`);
        } else {
            console.log('   ⚠️ Identidade NÃO ENCONTRADA!');
        }

        // 6. Verificar se há funções problemáticas
        console.log('\n6. Funções no schema auth:');
        const funcsRes = await client.query(`
            SELECT routine_name FROM information_schema.routines 
            WHERE routine_schema = 'auth' LIMIT 20
        `);
        funcsRes.rows.forEach(f => console.log(`   - ${f.routine_name}`));

        // 7. Verificar versão do GoTrue esperada
        console.log('\n7. Verificando schema_migrations:');
        const migRes = await client.query(`SELECT version FROM auth.schema_migrations ORDER BY version DESC LIMIT 5`);
        migRes.rows.forEach(m => console.log(`   - ${m.version}`));

        console.log('\n✅ Diagnóstico profundo concluído.');

    } catch (e) {
        console.error('❌ Erro:', e.message);
        console.error(e.stack);
    } finally {
        await client.end();
    }
}

deepDiagnose();
