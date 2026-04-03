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

async function testDifferentPasswords() {
    console.log('🔑 TESTANDO DIFERENTES SENHAS\n');

    const passwords = [
        'audi_home_2026',
        'Test123456!',  // senha usada no signup de teste
    ];

    for (const password of passwords) {
        console.log(`\nTestando senha: "${password}"`);

        const response = await fetch(
            `${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${env.VITE_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    email: 'master.audi.home@gmail.com',
                    password: password
                })
            }
        );

        console.log(`   Status: ${response.status}`);
        const text = await response.text();
        console.log(`   Resposta: ${text.substring(0, 100)}`);

        if (response.ok) {
            console.log('   🎉 SENHA CORRETA!');
            break;
        }
    }
}

testDifferentPasswords();
