const pg = require('pg');

const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function fixIdentities() {
    console.log('🔧 CORRIGINDO IDENTIDADES SUPABASE AUTH\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        // Buscar todos os usuários sem identidade
        const usersRes = await client.query(`
            SELECT u.id, u.email 
            FROM auth.users u 
            LEFT JOIN auth.identities i ON u.id = i.user_id 
            WHERE i.id IS NULL
        `);

        console.log(`Usuários sem identidade: ${usersRes.rows.length}`);

        for (const user of usersRes.rows) {
            console.log(`\n➡️  Criando identidade para: ${user.email}`);

            // Criar identidade do tipo 'email'
            const userId = user.id;
            await client.query(`
                INSERT INTO auth.identities (
                    id,
                    user_id, 
                    identity_data, 
                    provider,
                    provider_id,
                    last_sign_in_at,
                    created_at,
                    updated_at
                ) VALUES (
                    gen_random_uuid(),
                    $1::uuid,
                    jsonb_build_object('sub', $2::text, 'email', $3::text, 'email_verified', true, 'phone_verified', false),
                    'email',
                    $2::text,
                    now(),
                    now(),
                    now()
                )
            `, [userId, userId, user.email]);

            console.log(`   ✅ Identidade criada para ${user.email}`);
        }

        console.log('\n🎉 TODAS AS IDENTIDADES CRIADAS COM SUCESSO!');
        console.log('   Agora tente fazer login novamente.');

    } catch (e) {
        console.error('❌ Erro:', e.message);
    } finally {
        await client.end();
    }
}

fixIdentities();
