const pg = require('pg');

const PG_CONNECTION = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

async function setupSimpleAuth() {
    console.log('🔧 CONFIGURANDO SISTEMA DE LOGIN SIMPLES (SEM GOTRUE)\n');

    const client = new pg.Client({ connectionString: PG_CONNECTION, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        // 1. Adicionar coluna de senha na tabela perfis
        console.log('1. Adicionando coluna senha_hash em perfis...');
        await client.query(`
            ALTER TABLE public.perfis 
            ADD COLUMN IF NOT EXISTS senha_hash TEXT
        `);
        console.log('   ✅ Coluna adicionada');

        // 2. Criar hash das senhas para os usuários existentes
        console.log('\n2. Configurando senhas...');
        const password = 'audi_home_2026';

        // Atualizar todos os perfis com a senha
        await client.query(`
            UPDATE public.perfis 
            SET senha_hash = crypt($1, gen_salt('bf', 10))
            WHERE senha_hash IS NULL
        `, [password]);
        console.log('   ✅ Senhas configuradas');

        // 3. Verificar usuários disponíveis
        console.log('\n3. Usuários disponíveis para login:');
        const usersRes = await client.query(`
            SELECT email, nome, role, 
                   (senha_hash = crypt($1, senha_hash)) as senha_ok
            FROM public.perfis
        `, [password]);

        usersRes.rows.forEach(u => {
            console.log(`   - ${u.email} (${u.role}) - Senha: ${u.senha_ok ? '✅' : '❌'}`);
        });

        // 4. Criar função de login no banco
        console.log('\n4. Criando função de login no banco...');
        await client.query(`
            CREATE OR REPLACE FUNCTION public.login_simples(
                p_email TEXT,
                p_senha TEXT
            ) RETURNS JSON AS $$
            DECLARE
                v_user RECORD;
            BEGIN
                SELECT id, email, nome, role, condominio_id, administradora_id
                INTO v_user
                FROM public.perfis
                WHERE email = p_email
                  AND senha_hash = crypt(p_senha, senha_hash);
                
                IF v_user.id IS NULL THEN
                    RETURN json_build_object('success', false, 'error', 'Credenciais inválidas');
                END IF;
                
                RETURN json_build_object(
                    'success', true,
                    'user', json_build_object(
                        'id', v_user.id,
                        'email', v_user.email,
                        'name', v_user.nome,
                        'role', v_user.role,
                        'condominio_id', v_user.condominio_id,
                        'administradora_id', v_user.administradora_id
                    )
                );
            END;
            $$ LANGUAGE plpgsql SECURITY DEFINER;
        `);
        console.log('   ✅ Função login_simples criada');

        // 5. Testar a função
        console.log('\n5. Testando login...');
        const testEmail = usersRes.rows[0]?.email;
        if (testEmail) {
            const loginRes = await client.query(`SELECT login_simples($1, $2) as result`, [testEmail, password]);
            const result = loginRes.rows[0].result;
            console.log(`   Login com ${testEmail}: ${result.success ? '✅ SUCESSO' : '❌ FALHA'}`);
            if (result.success) {
                console.log(`   Usuário: ${result.user.name} (${result.user.role})`);
            }
        }

        console.log('\n✅ SISTEMA DE LOGIN SIMPLES CONFIGURADO!');
        console.log('\n📋 CREDENCIAIS:');
        usersRes.rows.forEach(u => {
            console.log(`   Email: ${u.email}`);
            console.log(`   Senha: audi_home_2026`);
            console.log(`   Role: ${u.role}`);
            console.log('   ---');
        });

    } catch (e) {
        console.error('❌ Erro:', e.message);
    } finally {
        await client.end();
    }
}

setupSimpleAuth();
