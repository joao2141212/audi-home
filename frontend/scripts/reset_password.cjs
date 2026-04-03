const pg = require('pg');

const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function resetPassword() {
    console.log('🔐 REDEFININDO SENHA DOS USUÁRIOS\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        const password = 'audi_home_2026';

        // Atualizar senha usando pgcrypto (bcrypt compatível com Supabase)
        console.log('Atualizando senha de master.audi.home@gmail.com...');
        await client.query(`
            UPDATE auth.users 
            SET encrypted_password = crypt($1, gen_salt('bf', 10)),
                updated_at = now()
            WHERE email = 'master.audi.home@gmail.com'
        `, [password]);
        console.log('   ✅ Senha atualizada');

        console.log('Atualizando senha de sindico.audi.home@gmail.com...');
        await client.query(`
            UPDATE auth.users 
            SET encrypted_password = crypt($1, gen_salt('bf', 10)),
                updated_at = now()
            WHERE email = 'sindico.audi.home@gmail.com'
        `, [password]);
        console.log('   ✅ Senha atualizada');

        // Testar se a senha funciona no banco
        console.log('\nVerificando se a senha funciona...');
        const testRes = await client.query(`
            SELECT email, (encrypted_password = crypt($1, encrypted_password)) as password_match
            FROM auth.users
            WHERE email IN ('master.audi.home@gmail.com', 'sindico.audi.home@gmail.com')
        `, [password]);

        testRes.rows.forEach(r => {
            console.log(`   - ${r.email}: ${r.password_match ? '✅ SENHA OK' : '❌ SENHA ERRADA'}`);
        });

        console.log('\n📋 CREDENCIAIS:');
        console.log('   Master: master.audi.home@gmail.com / audi_home_2026');
        console.log('   Síndico: sindico.audi.home@gmail.com / audi_home_2026');

    } catch (e) {
        console.error('❌ Erro:', e.message);
    } finally {
        await client.end();
    }
}

resetPassword();
