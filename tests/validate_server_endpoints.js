const assert = require('assert');

async function testEndpoints() {
    console.log('🚀 Testing Modular Server Endpoints...\n');
    const BASE_URL = 'http://localhost:3001';
    let failures = 0;

    async function check(url, method = 'GET', body = null, desc) {
        try {
            console.log(`👉 Testing ${desc} (${method} ${url})...`);
            const opts = { method, headers: { 'Content-Type': 'application/json' } };
            if (body) opts.body = JSON.stringify(body);

            const res = await fetch(`${BASE_URL}${url}`, opts);
            if (!res.ok) throw new Error(`Status ${res.status}`);

            const data = await res.json();
            console.log(`   ✅ Success`);
            return data;
        } catch (e) {
            console.error(`   ❌ FAIL: ${e.message}`);
            failures++;
            return null;
        }
    }

    // 1. Unpaid Boletos
    await check('/api/revenue/unpaid-boletos', 'GET', null, 'Unpaid Boletos Report');

    // 2. Revenue Anticipation List
    await check('/api/revenue/anticipation', 'GET', null, 'Anticipation List');

    // 3. Discrepancies Report (Corrected Path)
    await check('/api/audit/reports/divergences', 'GET', null, 'Discrepancies Report');

    // 3.5 SEED Reserve Config (Fix 500 error)
    await check('/api/reserve/config/save', 'POST', { valor_mensal_programado: 1000, saldo_inicial: 0 }, 'Seed Reserve Config');

    // 4. Reserve Audit
    await check('/api/reserve/audit/2026/01', 'GET', null, 'Reserve Audit (Jan 2026)');

    // 5. Save Anticipation (Logic Check)
    const antData = {
        data_operacao: '2025-02-01',
        valor_original: 1000,
        valor_liquido: 950,
        instituicao: 'TEST_BANK',
        details: 'Teste Automatizado',
        user_id: 1
    };
    await check('/api/revenue/anticipation/save', 'POST', antData, 'Save Anticipation Logic');

    console.log('\n================================');
    if (failures === 0) {
        console.log('🎉 ALL ENDPOINTS WORKING ON MODULAR SERVER.');
    } else {
        console.error(`⚠️ ${failures} ENDPOINTS FAILED.`);
        process.exit(1);
    }
}

testEndpoints();
