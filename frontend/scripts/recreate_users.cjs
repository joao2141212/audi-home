const pg = require('pg');
const fs = require('fs');
const path = require('path');

const loadEnv = () => {
    try {
        const content = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
        const env = {};
        content.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
        });
        return env;
    } catch { return {}; }
};

const env = loadEnv();
const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function recreateUsers() {
    console.log('🔄 RECRIANDO USUÁRIOS VIA API SUPABASE\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        // 1. Buscar condomínio existente
        const condoRes = await client.query(`SELECT id FROM public.condominios LIMIT 1`);
        const condominioId = condoRes.rows[0]?.id;
        console.log('Condomínio ID:', condominioId);

        // 2. Deletar usuários antigos e perfis
        console.log('\n1. Deletando usuários antigos...');
        await client.query(`DELETE FROM public.perfis WHERE email LIKE '%@audi.home'`);
        await client.query(`DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@audi.home')`);
        await client.query(`DELETE FROM auth.users WHERE email LIKE '%@audi.home'`);
        console.log('   ✅ Usuários antigos removidos');

        // 3. Criar novos usuários via API
        const users = [
            { email: 'master.audi.home@gmail.com', password: 'audi_home_2026', name: 'Admin Master', role: 'master', condoId: null },
            { email: 'sindico.audi.home@gmail.com', password: 'audi_home_2026', name: 'Síndico Horizonte', role: 'sindico', condoId: condominioId }
        ];

        for (const user of users) {
            console.log(`\n2. Criando via API: ${user.email}...`);

            const signupRes = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': env.VITE_SUPABASE_ANON_KEY
                },
                body: JSON.stringify({
                    email: user.email,
                    password: user.password,
                    options: {
                        data: { name: user.name }
                    }
                })
            });

            if (!signupRes.ok) {
                const errorText = await signupRes.text();
                console.log(`   ❌ Erro no signup: ${errorText}`);
                continue;
            }

            const userData = await signupRes.json();
            console.log(`   ✅ Usuário criado: ${userData.id}`);

            // 4. Confirmar email diretamente no banco (bypass confirmação)
            await client.query(`
                UPDATE auth.users 
                SET email_confirmed_at = now(),
                    confirmation_token = null
                WHERE id = $1
            `, [userData.id]);
            console.log(`   ✅ Email confirmado`);

            // 5. Criar perfil
            await client.query(`
                INSERT INTO public.perfis (id, email, nome, role, condominio_id)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, condominio_id = EXCLUDED.condominio_id
            `, [userData.id, user.email, user.name, user.role, user.condoId]);
            console.log(`   ✅ Perfil criado`);
        }

        console.log('\n\n🎉 USUÁRIOS RECRIADOS COM SUCESSO!');
        console.log('\n📋 NOVAS CREDENCIAIS:');
        console.log('   Master: master.audi.home@gmail.com / audi_home_2026');
        console.log('   Síndico: sindico.audi.home@gmail.com / audi_home_2026');

    } catch (e) {
        console.error('❌ Erro:', e.message);
    } finally {
        await client.end();
    }
}

recreateUsers();
