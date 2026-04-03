const pg = require('pg');

const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function checkAuthUsers() {
    console.log('🔍 VERIFICANDO AUTH.USERS\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        // Listar todos os usuários no auth.users  
        const usersRes = await client.query(`
            SELECT id, email, encrypted_password IS NOT NULL as has_password, 
                   email_confirmed_at IS NOT NULL as email_confirmed,
                   aud, role, instance_id, is_sso_user, deleted_at, is_anonymous
            FROM auth.users
        `);

        console.log('Usuários em auth.users:');
        usersRes.rows.forEach(u => {
            console.log(`\n📧 ${u.email}`);
            console.log(`   id: ${u.id}`);
            console.log(`   has_password: ${u.has_password}`);
            console.log(`   email_confirmed: ${u.email_confirmed}`);
            console.log(`   aud: ${u.aud}`);
            console.log(`   role: ${u.role}`);
            console.log(`   instance_id: ${u.instance_id}`);
            console.log(`   is_sso_user: ${u.is_sso_user}`);
            console.log(`   deleted_at: ${u.deleted_at}`);
            console.log(`   is_anonymous: ${u.is_anonymous}`);
        });

        // Verificar identidades
        console.log('\n\nIdentidades em auth.identities:');
        const idRes = await client.query(`
            SELECT user_id, provider, provider_id, email 
            FROM auth.identities
        `);
        idRes.rows.forEach(i => {
            console.log(`   - ${i.email} (${i.provider}) -> user: ${i.user_id}`);
        });

    } catch (e) {
        console.error('❌ Erro:', e.message);
    } finally {
        await client.end();
    }
}

checkAuthUsers();
