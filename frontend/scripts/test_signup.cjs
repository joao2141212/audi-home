// Script para criar um usuário via API do Supabase (signup) que é garantido funcionar
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

async function createUserViaAPI() {
    console.log('🆕 CRIANDO USUÁRIO VIA API SUPABASE (SIGNUP)\n');

    // Vamos criar um usuário novo via signup para ver se funciona
    const testEmail = `test_${Date.now()}@gmail.com`;
    const testPassword = 'Test123456!';

    const url = `${env.VITE_SUPABASE_URL}/auth/v1/signup`;
    const body = JSON.stringify({
        email: testEmail,
        password: testPassword
    });

    console.log('URL:', url);
    console.log('Email:', testEmail);
    console.log('\nEnviando requisição de signup...\n');

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': env.VITE_SUPABASE_ANON_KEY
            },
            body: body
        });

        console.log('Status:', response.status, response.statusText);

        const text = await response.text();
        console.log('\n--- RESPOSTA ---');
        console.log(text);
        console.log('--- FIM ---\n');

        if (response.ok) {
            console.log('✅ SIGNUP FUNCIONOU! O problema é com os usuários existentes.');
            console.log('   Isso significa que precisamos recriar os usuários via Dashboard ou API.');
        } else {
            console.log('❌ SIGNUP TAMBÉM FALHOU - Problema é no serviço GoTrue');
        }

    } catch (e) {
        console.error('❌ Erro de rede:', e.message);
    }
}

createUserViaAPI();
