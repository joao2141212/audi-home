const pg = require('pg');
const connectionString = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        await client.connect();
        console.log('✅ Conectado ao Postgres do Audi Home!');

        // 1. Criar Administradora
        const resAdmin = await client.query(`
            INSERT INTO public.administradoras (nome, cnpj) 
            VALUES ('Audi Home Gestão', '00.000.000/0001-00') 
            ON CONFLICT (cnpj) DO UPDATE SET nome = EXCLUDED.nome
            RETURNING id;
        `);
        const adminId = resAdmin.rows[0].id;

        // 2. Criar Condomínio
        const resCondo1 = await client.query(`
            INSERT INTO public.condominios (nome, cnpj, administradora_id, endereco) 
            VALUES ('Residencial Horizonte', '11.111.111/0001-11', '${adminId}', 'Rua das Flores, 123') 
            ON CONFLICT (cnpj) DO UPDATE SET nome = EXCLUDED.nome
            RETURNING id;
        `);
        const condoId1 = resCondo1.rows[0].id;

        // 3. Criar Usuários no Auth via SQL (Sem ON CONFLICT para evitar erros de constraint)
        const passwordHash = '$2a$10$7Z8m7Z8m7Z8m7Z8m7Z8m7uP5P5P5P5P5P5P5P5P5P5P5P5P5P5P5P5';

        const createTestUser = async (email, name, role, condoId) => {
            console.log(`👤 Verificando usuário: ${email}`);
            const check = await client.query('SELECT id FROM auth.users WHERE email = $1', [email]);

            let userId;
            if (check.rows.length === 0) {
                console.log(`   Criando novo usuário ${email}...`);
                const res = await client.query(`
                    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
                    VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1, crypt($2, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', $3, now(), now())
                    RETURNING id;
                `, [email, 'Jp974403024', JSON.stringify({ name })]);
                userId = res.rows[0].id;
            } else {
                console.log(`   Usuário ${email} já existe.`);
                userId = check.rows[0].id;
            }

            console.log(`   Configurando perfil para ${role}...`);
            await client.query(`
                INSERT INTO public.perfis (id, email, nome, role, condominio_id)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, condominio_id = EXCLUDED.condominio_id;
            `, [userId, email, name, role, condoId]);
        };

        await createTestUser('master@audi.home', 'Admin Master', 'master', null);
        await createTestUser('sindico@audi.home', 'Síndico Horizonte', 'sindico', condoId1);

        console.log('\n🚀 Sucesso! Use estas credenciais no Audi Home:');
        console.log('--- MASTER: master@audi.home / Jp974403024');
        console.log('--- SÍNDICO: sindico@audi.home / Jp974403024');

    } catch (err) {
        console.error('❌ Erro no seed:', err.message);
    } finally {
        await client.end();
    }
}

run();
