const pg = require('pg');
const connectionString = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        await client.connect();
        console.log('✅ Conectado para limpeza de segurança.');

        const genericPassword = 'audi_home_2026';

        console.log('🧹 Alterando senhas dos usuários de teste para o padrão de auditoria...');

        await client.query(`
            UPDATE auth.users 
            SET encrypted_password = crypt($1, gen_salt('bf'))
            WHERE email IN ('master@audi.home', 'sindico@audi.home');
        `, [genericPassword]);

        console.log('✅ Senhas pessoais removidas do banco de dados.');
        console.log('\nNovas credenciais para teste (Audit Mode):');
        console.log(`- master@audi.home / ${genericPassword}`);
        console.log(`- sindico@audi.home / ${genericPassword}`);

    } catch (err) {
        console.error('❌ Erro na limpeza:', err.message);
    } finally {
        await client.end();
    }
}

run();
