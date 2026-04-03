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

// EMAIL QUE ACABAMOS DE CRIAR (pegue do output anterior se precisar mudar)
// Mas vamos buscar o mais recente criado via API
async function confirmAndLogin() {
    console.log('✅ CONFIRMANDO EMAIL E TESTANDO LOGIN\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        // 1. Buscar o usuário mais recente criado
        const res = await client.query(`
            SELECT id, email FROM auth.users 
            ORDER BY created_at DESC LIMIT 1
        `);
        const user = res.rows[0];
        console.log(`Usuário encontrado: ${user.email} (${user.id})`);

        // 2. Confirmar email (Hack DB)
        await client.query(`
            UPDATE auth.users 
            SET email_confirmed_at = now(),
                confirmation_token = null
            WHERE id = $1
        `, [user.id]);
        console.log('   ✅ Email confirmado via Banco');

        // 3. Criar Perfil (Necessário para o app funcionar)
        await client.query(`
            INSERT INTO public.perfis (id, email, nome, role)
            VALUES ($1, $2, 'Admin Teste', 'master')
            ON CONFLICT (id) DO UPDATE SET role = 'master'
        `, [user.id, user.email]);
        console.log('   ✅ Perfil Master criado');

        // 4. Testar Login via API
        console.log('\n🔐 TENTANDO LOGIN FINAL...');
        const rawResponse = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': env.VITE_SUPABASE_ANON_KEY
            },
            body: JSON.stringify({
                email: user.email,
                password: 'audi_home_2026'
            })
        });

        if (rawResponse.ok) {
            console.log('   🎉 SUCESSO! LOGIN FUNCIONANDO.');
            console.log('   ---------------------------------------------------');
            console.log(`   USE ESTE EMAIL: ${user.email}`);
            console.log('   USE ESTA SENHA: audi_home_2026');
            console.log('   ---------------------------------------------------');
        } else {
            console.log('   ❌ Login ainda falhou.');
            console.log(await rawResponse.text());
        }

    } catch (e) {
        console.error('❌ Erro:', e.message);
    } finally {
        await client.end();
    }
}

confirmAndLogin();
