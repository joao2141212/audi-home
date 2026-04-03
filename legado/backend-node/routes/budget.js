const express = require('express');
const { db } = require('../config/database');

const router = express.Router();

// GET /api/budget - Listar orçamento
router.get('/', (req, res) => {
    db.all(`SELECT * FROM orcamento_anual ORDER BY categoria ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ budget: rows });
    });
});

// POST /api/budget/save - Salvar orçamento
router.post('/save', (req, res) => {
    const { categoria, valor_planejado, ano } = req.body;
    db.run(`INSERT INTO orcamento_anual (categoria, valor_planejado, ano, user_id) VALUES (?, ?, ?, ?)`,
        [categoria, valor_planejado, ano || 2026, 1],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

module.exports = router;
