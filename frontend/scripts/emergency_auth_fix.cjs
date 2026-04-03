const pg = require('pg');
const path = require('path');
const fs = require('fs');

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

const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function fix() {
    console.log('🛠  TENTATIVA BRUTA DE REPARO DO AUTH SUPABASE...');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        console.log('1. Forçando Permissions do Schema AUTH...');
        await client.query(`GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;`);
        await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA auth TO postgres, service_role, dashboard_user;`);
        await client.query(`GRANT ALL ON ALL TABLES IN SCHEMA auth TO postgres;`);

        console.log('2. Recriando Função de Reload de Schema (Hack)...');
        await client.query(`NOTIFY pgrst, 'reload config';`);

        console.log('3. Verificando usuário Master...');
        const res = await client.query(`SELECT id, email, encrypted_password FROM auth.users WHERE email = 'master@audi.home'`);
        console.log('   Encontrado:', res.rows[0]?.email);

        console.log('4. Limpando Cache de Plans...');
        await client.query(`DISCARD PLANS;`);

        console.log('\n✅ Reparos aplicados no Banco. Tente logar agora (pode levar 30s).');

    } catch (e) {
        console.error('❌ Erro:', e.message);
    } finally {
        await client.end();
    }
}

fix();
