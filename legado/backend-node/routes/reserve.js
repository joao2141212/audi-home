const express = require('express');
const { db } = require('../config/database');

const router = express.Router();

// GET /api/reserve/config - Obter configuração
router.get('/config', (req, res) => {
    db.get(`SELECT * FROM reserva_config LIMIT 1`, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || { valor_mensal_programado: 0, saldo_inicial: 0 });
    });
});

// POST /api/reserve/config/save - Salvar configuração
router.post('/config/save', (req, res) => {
    const { valor_mensal_programado, saldo_inicial } = req.body;
    db.run(`DELETE FROM reserva_config`);
    db.run(`INSERT INTO reserva_config (valor_mensal_programado, saldo_inicial, user_id) VALUES (?, ?, ?)`,
        [valor_mensal_programado, saldo_inicial, 1],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// GET /api/reserve/movimentacoes - Listar movimentações
router.get('/movimentacoes', (req, res) => {
    db.all(`SELECT * FROM reserva_movimentacoes ORDER BY data_movimentacao DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ movimentacoes: rows });
    });
});

// POST /api/reserve/movimentacoes/save - Salvar movimentação
router.post('/movimentacoes/save', (req, res) => {
    const { tipo, valor, data_movimentacao, descricao } = req.body;
    db.run(`INSERT INTO reserva_movimentacoes (tipo, valor, data_movimentacao, descricao, user_id) VALUES (?, ?, ?, ?, ?)`,
        [tipo, valor, data_movimentacao, descricao, 1],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});


// GET /api/reserve/audit/:year/:month - Auditoria Mensal (Migrado de server.js)
router.get('/audit/:year/:month', (req, res) => {
    const { year, month } = req.params;
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-31`;

    db.get(`SELECT valor_mensal_programado FROM reserva_config LIMIT 1`, (err, config) => {
        if (err || !config) return res.status(500).json({ error: 'Configuração de Reserva não encontrada' });

        const target = config.valor_mensal_programado;

        db.get(`
            SELECT SUM(valor) as realizado 
            FROM reserva_movimentacoes 
            WHERE tipo = 'DEPOSITO' 
            AND data_movimentacao BETWEEN ? AND ?
        `, [startDate, endDate], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });

            const realizado = row.realizado || 0;
            const diff = realizado - target;
            const status = diff >= 0 ? 'CONFORME' : 'DIVERGENTE';

            res.json({
                periodo: `${month}/${year}`,
                meta: target,
                realizado: realizado,
                diferenca: diff,
                status: status
            });
        });
    });
});

module.exports = router;
