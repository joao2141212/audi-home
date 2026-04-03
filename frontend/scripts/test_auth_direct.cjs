// Teste direto da API REST do Supabase Auth para capturar erro real
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

async function testAuthDirectly() {
    console.log('🔍 TESTE DIRETO DA API SUPABASE AUTH (COM LOGS COMPLETOS)\n');

    const url = `${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`;
    const body = JSON.stringify({
        email: 'master.audi.home@gmail.com',
        password: 'audi_home_2026'
    });

    console.log('URL:', url);
    console.log('Body:', body);
    console.log('\nEnviando requisição...\n');

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': env.VITE_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${env.VITE_SUPABASE_ANON_KEY}`
            },
            body: body
        });

        console.log('Status:', response.status, response.statusText);
        console.log('Headers:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));

        const text = await response.text();
        console.log('\n--- RESPOSTA COMPLETA ---');
        console.log(text);
        console.log('--- FIM ---\n');

        if (response.ok) {
            console.log('✅ LOGIN FUNCIONOU!');
        } else {
            console.log('❌ LOGIN FALHOU - Ver detalhes acima');
        }

    } catch (e) {
        console.error('❌ Erro de rede:', e.message);
    }
}

testAuthDirectly();
