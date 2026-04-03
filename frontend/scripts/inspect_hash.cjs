const pg = require('pg');

const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function inspectHash() {
    console.log('🔍 INSPECIONANDO HASH DE SENHA\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        const res = await client.query(`
            SELECT email, encrypted_password, length(encrypted_password) as len
            FROM auth.users
            WHERE email = 'master.audi.home@gmail.com'
        `);

        const u = res.rows[0];
        console.log('Email:', u.email);
        console.log('Hash:', u.encrypted_password);
        console.log('Length:', u.len);
        console.log('Prefix:', u.encrypted_password.substring(0, 7));

        // Supabase GoTrue espera formato: $2a$10$... (bcrypt com cost 10)
        // Vamos verificar se é $2a$ (bcrypt)
        if (u.encrypted_password.startsWith('$2a$')) {
            console.log('\n✅ Prefixo $2a$ correto (bcrypt)');
        } else if (u.encrypted_password.startsWith('$2b$')) {
            console.log('\n⚠️ Prefixo $2b$ - Supabase pode esperar $2a$');
        }

    } catch (e) {
        console.error('❌ Erro:', e.message);
    } finally {
        await client.end();
    }
}

inspectHash();
