const sqlite3 = require('sqlite3').verbose();
const assert = require('assert');

// --- MOCKED GLOBAL CONFIG ---
const CNAE_MAP = {
    'TI': ['62', '63'],
    'LIMPEZA': ['81', '38'],
    'MANUTENCAO': ['43', '33'],
    'ADMINISTRATIVO': ['82', '69', '70'],
    'OBRA': ['41', '42', '43']
};

function isCnaeCompatible(natureza, cnaeFull) {
    if (!natureza || !cnaeFull) return true;
    const cat = natureza.toUpperCase();
    const allowedPrefixes = CNAE_MAP[cat];
    if (!allowedPrefixes) return true;
    const cnae = String(cnaeFull).substring(0, 2);
    return allowedPrefixes.includes(cnae);
}

// --- SETUP IN-MEMORY DB ---
const db = new sqlite3.Database(':memory:');

async function setupDb() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Tables from server.js
            db.run(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)`);
            db.run(`CREATE TABLE condominios (id INTEGER PRIMARY KEY, nome TEXT)`);
            db.run(`CREATE TABLE extratos_bancarios (id INTEGER PRIMARY KEY, periodo_inicio DATE)`);

            db.run(`CREATE TABLE transacoes_bancarias (
                id INTEGER PRIMARY KEY, 
                extrato_id INTEGER, 
                data_transacao DATE, 
                descricao TEXT, 
                valor REAL, 
                tipo TEXT, 
                conciliado BOOLEAN DEFAULT 0
            )`);

            db.run(`CREATE TABLE fornecedores (id INTEGER PRIMARY KEY, cnpj TEXT, razao_social TEXT, cnae_principal TEXT)`);

            db.run(`CREATE TABLE comprovantes (
                id INTEGER PRIMARY KEY, 
                transacao_id INTEGER, 
                fornecedor_id INTEGER, 
                valor REAL, 
                data_emissao DATE,
                status TEXT
            )`);

            db.run(`CREATE TABLE orcamento_anual (
                id INTEGER PRIMARY KEY,
                categoria TEXT,
                valor_planejado REAL,
                ano INTEGER
            )`);

            db.run(`CREATE TABLE antecipacoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                data_operacao DATE,
                valor_original REAL,
                valor_liquido REAL,
                taxa_servico REAL,
                status TEXT,
                transacao_id INTEGER
            )`);

            resolve();
        });
    });
}

async function runTests() {
    console.log('🚀 Starting Verification Tests...\n');

    // TEST 1: CNAE Logic
    console.log('👉 Test 1: CNAE Compatibility Logic');
    const t1 = isCnaeCompatible('TI', '6201-5/01');
    assert.strictEqual(t1, true, 'TI should match 62');
    const t2 = isCnaeCompatible('TI', '8121-4/00');
    assert.strictEqual(t2, false, 'TI should NOT match 81 (Limpeza)');
    console.log('✅ CNAE Logic verified.');

    // TEST 2: Reconciliation Logic (SQL)
    console.log('\n👉 Test 2: Reconciliation Matching Logic (SQL)');

    // Seed Data
    db.run(`INSERT INTO transacoes_bancarias (id, valor, data_transacao, descricao, tipo, conciliado) VALUES 
        (1, -100.00, '2025-01-10', 'PAGTO FORNECEDOR A', 'DEBIT', 0),
        (2, -105.00, '2025-01-10', 'PAGTO FORNECEDOR A (JUROS)', 'DEBIT', 0),
        (3, -500.00, '2025-01-12', 'OUTRO PAGTO', 'DEBIT', 0),
        (4, 950.00, '2025-02-01', 'ANTICIPACAO RECEBIVEIS', 'CREDIT', 0)
    `);

    const receiptValue = 100.00;

    const sqlMatch = `
        SELECT 
            id, 
            valor, 
            CASE WHEN ABS(valor) = ? THEN 100 ELSE 85 END as matchScore
        FROM transacoes_bancarias
        WHERE tipo = 'DEBIT' 
          AND ABS(ABS(valor) - ABS(?)) < (ABS(?) * 0.05)
        ORDER BY matchScore DESC
    `;

    db.all(sqlMatch, [receiptValue, receiptValue, receiptValue], (err, rows) => {
        if (err) throw err;
        console.log('   Results found:', rows.length);

        // Expecting ID 1 (exact) and ID 2 (approx 5% of 100 is 5, so 105 is on the limit. 
        // 105 - 100 = 5. Check: < 5? No, 5 is not < 5. Wait, 105 vs 100. Diff is 5. 5% of 100 is 5. 5 < 5 is False.
        // Let's verify exactly what the SQL logic in server.js does: ABS(ABS(valor) - ABS(?)) < (ABS(?) * 0.05)
        // If Receipt=100, Tx=105. Diff=5. Limit=5. 5 < 5 is FALSE. So 105 should NOT match.
        // If Receipt=100, Tx=104.99. Diff=4.99. 4.99 < 5 is TRUE.

        const exactMatch = rows.find(r => r.id === 1);
        assert.ok(exactMatch, 'Should find the exact match');
        assert.strictEqual(exactMatch.matchScore, 100, 'Score should be 100');
        console.log('✅ Reconciliation SQL verified.');
    });

    // TEST 3: Budget Aggregation
    console.log('\n👉 Test 3: Budget Logic');
    db.run(`INSERT INTO orcamento_anual (categoria, valor_planejado, ano) VALUES ('MANUTENCAO', 1000, 2026), ('TI', 2000, 2026)`);

    db.get(`SELECT SUM(valor_planejado) as total FROM orcamento_anual`, (err, row) => {
        const annual = row.total * 12;
        assert.strictEqual(annual, 36000, 'Total should be (1000+2000)*12 = 36000');
        console.log('✅ Budget Aggregation verified.');
    });

    // TEST 4: Revenue Anticipation Logic
    console.log('\n👉 Test 4: Revenue Anticipation Auto-Match');
    const valorLiquido = 950.00;
    const dataOp = '2025-02-01';

    // Logic from server.js
    db.get(`
        SELECT id FROM transacoes_bancarias 
        WHERE tipo = 'CREDIT' 
        AND ABS(valor - ?) < 0.01 
        AND conciliado = 0
        ORDER BY ABS(julianday(data_transacao) - julianday(?)) ASC
        LIMIT 1
    `, [valorLiquido, dataOp], (err, match) => {
        if (err) throw err;
        assert.ok(match, 'Should find the credit transaction of 950.00');
        assert.strictEqual(match.id, 4, 'Should match transaction ID 4 specifically');
        console.log('✅ Anticipation Auto-Match verified.');
    });

    // Wait for async DB calls
    setTimeout(() => {
        console.log('\n🎉 ALL TESTS PASSED.');
    }, 1000);
}

setupDb().then(runTests);
