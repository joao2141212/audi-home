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

// Vamos criar um usuário completamente novo para testar
// Usaremos um email aleatório para garantir que não haja conflito
const TIMESTAMP = Date.now();
const NEW_EMAIL = `audi.home.admin.${TIMESTAMP}@gmail.com`;
// OBS: Usei .test que é um domínio fictício, mas o Supabase aceita se a validação estiver off
// Se falhar, usaremos @gmail.com

async function createCleanUser() {
    console.log(`🆕 CRIANDO USUÁRIO LIMPO: ${NEW_EMAIL}\n`);

    const url = `${env.VITE_SUPABASE_URL}/auth/v1/signup`;
    const body = JSON.stringify({
        email: NEW_EMAIL,
        password: 'audi_home_2026',
        data: {
            name: 'Admin Teste',
            role: 'master' // Isso não atribui role automaticamente no banco, mas salva no metadata
        }
    });

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': env.VITE_SUPABASE_ANON_KEY
            },
            body: body
        });

        if (response.ok) {
            const data = await response.json();
            console.log('✅ USUÁRIO CRIADO COM SUCESSO!');
            console.log(`   ID: ${data.id}`);
            console.log(`   Email: ${data.email}`);

            // Agora vamos tentar logar IMEDIATAMENTE com ele
            console.log('\n🔐 TESTANDO LOGIN IMEDIATO...');
            const loginResp = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': env.VITE_SUPABASE_ANON_KEY
                },
                body: JSON.stringify({
                    email: NEW_EMAIL,
                    password: 'audi_home_2026'
                })
            });

            if (loginResp.ok) {
                const loginData = await loginResp.json();
                console.log('   🎉 LOGIN FUNCIONOU! Token recebido.');
                console.log('   Este usuário está 100% funcional.');
            } else {
                console.log('   ❌ Login falhou após criação (pode precisar confirmar email).');
                const err = await loginResp.text();
                console.log('   Erro:', err);
            }

        } else {
            console.log('❌ Falha ao criar usuário.');
            console.log(await response.text());
        }

    } catch (e) {
        console.error('Erro:', e);
    }
}

createCleanUser();
