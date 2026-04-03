const express = require('express');
const { db } = require('../config/database');

const router = express.Router();

// GET /api/revenue/boletos - Listar boletos
router.get('/boletos', (req, res) => {
    db.all(`SELECT * FROM boletos_emitidos ORDER BY vencimento DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ boletos: rows });
    });
});

// POST /api/revenue/boletos/save - Salvar boleto
router.post('/boletos/save', (req, res) => {
    const { pagador, valor, vencimento, status } = req.body;
    db.run(`INSERT INTO boletos_emitidos (pagador, valor, vencimento, status, user_id) VALUES (?, ?, ?, ?, ?)`,
        [pagador, valor, vencimento, status || 'aberto', 1],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});


// GET /api/reports/unpaid-boletos - Relatório de boletos não pagos (Migrado de server.js)
router.get('/unpaid-boletos', (req, res) => {
    const sql = `
        SELECT * FROM boletos_emitidos 
        WHERE status = 'aberto' AND vencimento < date('now')
        ORDER BY vencimento ASC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ boletos_atrasados: rows, total: rows.length });
    });
});

// GET /api/revenue/anticipation - Listar antecipações
router.get('/anticipation', (req, res) => {
    db.all(`SELECT * FROM antecipacoes ORDER BY data_operacao DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ antecipacoes: rows });
    });
});

// POST /api/revenue/anticipation/save - Salvar antecipação com Auto-Reconciliação
router.post('/anticipation/save', (req, res) => {
    const { data_operacao, valor_original, valor_liquido, instituicao, details, user_id } = req.body;

    const taxa_servico = (parseFloat(valor_original) - parseFloat(valor_liquido)).toFixed(2);

    db.serialize(() => {
        // 1. Tenta achar o match automático (Crédito com valor exato)
        db.get(`
            SELECT id FROM transacoes_bancarias 
            WHERE tipo = 'CREDIT' 
            AND ABS(valor - ?) < 0.01 
            AND conciliado = 0
            ORDER BY ABS(julianday(data_transacao) - julianday(?)) ASC
            LIMIT 1
        `, [valor_liquido, data_operacao], (err, match) => {

            let status = 'pendente';
            let transacao_id = null;

            if (match) {
                status = 'conciliado';
                transacao_id = match.id;
            }

            // 2. Salva a antecipação
            db.run(`INSERT INTO antecipacoes (user_id, data_operacao, valor_original, valor_liquido, taxa_servico, instituicao, status, transacao_id, details)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [user_id || 1, data_operacao, valor_original, valor_liquido, taxa_servico, instituicao, status, transacao_id, details],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    const newId = this.lastID;

                    // 3. Se deu match, atualiza a transação também
                    if (match) {
                        db.run(`UPDATE transacoes_bancarias SET conciliado = 1, audit_status = 'aprovado', audit_report = 'Conciliado Automaticamente via Modulo Antecipacao' WHERE id = ?`, [match.id]);
                        console.log(`✅ [ANTECIPACAO] Match automático realizado! ID Antecipação: ${newId} <-> Transaction: ${match.id}`);
                    }

                    res.json({ success: true, id: newId, status: status, matched_transaction_id: transacao_id, taxa_calculada: taxa_servico });
                }
            );
        });
    });
});

module.exports = router;
