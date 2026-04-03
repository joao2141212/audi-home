const pg = require('pg');
const crypto = require('crypto');

const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function fixPassword() {
    console.log('🔐 CORRIGINDO HASH DE SENHA (FORMATO SUPABASE)\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        // Verificar hash atual
        const currentRes = await client.query(`SELECT encrypted_password FROM auth.users WHERE email = 'master@audi.home'`);
        console.log('Hash atual:', currentRes.rows[0]?.encrypted_password);

        // O Supabase GoTrue usa bcrypt com prefixo $2a$ 
        // pgcrypto gen_salt('bf') gera $2a$ que é compatível
        // Mas vamos verificar se o hash está correto tentando regenerar

        // Gerar novo hash usando o mesmo método que o Supabase usa internamente
        // O Supabase usa bcrypt com cost 10
        const newPassword = 'audi_home_2026';

        // Usar pgcrypto para gerar hash compatível
        await client.query(`
            UPDATE auth.users 
            SET encrypted_password = crypt($1, gen_salt('bf', 10)),
                updated_at = now()
            WHERE email = 'master@audi.home'
        `, [newPassword]);

        await client.query(`
            UPDATE auth.users 
            SET encrypted_password = crypt($1, gen_salt('bf', 10)),
                updated_at = now()
            WHERE email = 'sindico@audi.home'
        `, [newPassword]);

        // Verificar novo hash
        const newRes = await client.query(`SELECT encrypted_password FROM auth.users WHERE email = 'master@audi.home'`);
        console.log('Novo hash:', newRes.rows[0]?.encrypted_password);

        // Testar se o hash funciona
        const testRes = await client.query(`
            SELECT (encrypted_password = crypt($1, encrypted_password)) as password_match 
            FROM auth.users WHERE email = 'master@audi.home'
        `, [newPassword]);
        console.log('Teste de senha:', testRes.rows[0]?.password_match ? '✅ MATCH' : '❌ NO MATCH');

        console.log('\n✅ Senhas atualizadas. Tente logar novamente.');

    } catch (e) {
        console.error('❌ Erro:', e.message);
    } finally {
        await client.end();
    }
}

fixPassword();
