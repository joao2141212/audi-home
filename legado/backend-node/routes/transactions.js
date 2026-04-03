const express = require('express');
const { db } = require('../config/database');

const router = express.Router();

// GET /api/transactions - Listar todas transações
router.get('/', (req, res) => {
    const sql = `
        SELECT 
            t.id, 
            t.data_transacao as date, 
            t.descricao as description, 
            t.valor as amount, 
            t.tipo as type,
            t.conciliado
        FROM transacoes_bancarias t
        ORDER BY t.data_transacao DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ transactions: rows });
    });
});

// GET /api/expenses - Listar despesas para auditoria
router.get('/expenses', (req, res) => {
    const sql = `
        SELECT 
            id, 
            data_transacao as date, 
            descricao as description, 
            ABS(valor) as amount, 
            audit_status as auditStatus
        FROM transacoes_bancarias 
        WHERE tipo = 'DEBIT'
        ORDER BY data_transacao DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ expenses: rows });
    });
});

module.exports = router;
