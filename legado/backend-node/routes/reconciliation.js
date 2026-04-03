const express = require('express');
const { db } = require('../config/database');

const router = express.Router();

// GET /api/reconciliation/queue - Fila de comprovantes pendentes
router.get('/queue', (req, res) => {
    const sql = `
        SELECT 
            c.id, 
            c.valor, 
            c.data_emissao as data, 
            f.razao_social as unidade, 
            c.status,
            c.arquivo_nome,
            95 as ocrConfianca
        FROM comprovantes c
        JOIN fornecedores f ON c.fornecedor_id = f.id
        WHERE c.transacao_id IS NULL
        ORDER BY c.data_emissao DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ queue: rows });
    });
});

// GET /api/reconciliation/matches/:receiptId - Buscar matches
router.get('/matches/:receiptId', (req, res) => {
    const receiptId = req.params.receiptId;

    db.get(`SELECT c.*, f.razao_social FROM comprovantes c JOIN fornecedores f ON c.fornecedor_id = f.id WHERE c.id = ?`, [receiptId], (err, receipt) => {
        if (err || !receipt) return res.status(404).json({ error: 'Comprovante não encontrado' });

        const sql = `
            SELECT id, valor, data_transacao as data, descricao
            FROM transacoes_bancarias 
            WHERE tipo = 'DEBIT' AND conciliado = 0
            ORDER BY ABS(ABS(valor) - ?) ASC
            LIMIT 20
        `;

        db.all(sql, [receipt.valor], (err, txs) => {
            if (err) return res.status(500).json({ error: err.message });

            const matches = txs.map(tx => {
                let score = 0;
                let reasons = [];

                if (Math.abs(tx.valor) === receipt.valor) {
                    score += 70;
                    reasons.push('Valor Exato');
                } else if (Math.abs(Math.abs(tx.valor) - receipt.valor) < 1) {
                    score += 40;
                    reasons.push('Valor Aproximado');
                }

                const txDate = new Date(tx.data);
                const rcDate = new Date(receipt.data_emissao);
                const diffDays = Math.ceil(Math.abs(txDate - rcDate) / (1000 * 60 * 60 * 24));

                if (diffDays <= 2) { score += 20; reasons.push('Data Próxima'); }
                else if (diffDays <= 7) { score += 10; reasons.push('Mesma Semana'); }

                if (tx.descricao.toLowerCase().includes(receipt.razao_social.toLowerCase().split(' ')[0])) {
                    score += 10;
                    reasons.push('Nome Compatível');
                }

                return { ...tx, matchScore: Math.min(score, 100), matchReasons: reasons };
            }).filter(m => m.matchScore > 20).sort((a, b) => b.matchScore - a.matchScore);

            res.json({ matches });
        });
    });
});

// POST /api/reconciliation/matches/multi - Matches para múltiplos comprovantes
router.post('/matches/multi', (req, res) => {
    const { receiptIds } = req.body;
    if (!receiptIds?.length) return res.status(400).json({ error: 'Nenhum ID enviado' });

    const placeholders = receiptIds.map(() => '?').join(',');
    db.all(`SELECT c.*, f.razao_social FROM comprovantes c JOIN fornecedores f ON c.fornecedor_id = f.id WHERE c.id IN (${placeholders})`, receiptIds, (err, receipts) => {
        if (err || !receipts?.length) return res.status(404).json({ error: 'Comprovantes não encontrados' });

        const totalValor = receipts.reduce((acc, r) => acc + r.valor, 0);

        db.all(`SELECT id, valor, data_transacao as data, descricao FROM transacoes_bancarias WHERE tipo = 'DEBIT' AND conciliado = 0 ORDER BY ABS(ABS(valor) - ?) ASC LIMIT 20`, [totalValor], (err, txs) => {
            if (err) return res.status(500).json({ error: err.message });

            const matches = txs.map(tx => {
                let score = Math.abs(Math.abs(tx.valor) - totalValor) < 0.05 ? 80 : (Math.abs(Math.abs(tx.valor) - totalValor) < 1 ? 50 : 0);
                return { ...tx, matchScore: score, matchReasons: score > 0 ? ['Valor Total'] : [] };
            }).filter(m => m.matchScore > 20).sort((a, b) => b.matchScore - a.matchScore);

            res.json({ matches, totalCalculado: totalValor });
        });
    });
});

// POST /api/reconciliation/link - Vincular comprovante a transação
router.post('/link', (req, res) => {
    const { transacao_id, comprovante_id } = req.body;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run(`UPDATE comprovantes SET transacao_id = ?, status = 'auditado' WHERE id = ?`, [transacao_id, comprovante_id], (err) => {
            if (err) { db.run('ROLLBACK'); return res.status(500).json({ error: 'Erro ao vincular' }); }
            db.run(`UPDATE transacoes_bancarias SET conciliado = 1 WHERE id = ?`, [transacao_id], (err) => {
                if (err) { db.run('ROLLBACK'); return res.status(500).json({ error: 'Erro ao atualizar transação' }); }
                db.run('COMMIT');
                res.json({ success: true });
            });
        });
    });
});

// POST /api/reconciliation/link-multi - Vincular múltiplos comprovantes
router.post('/link-multi', (req, res) => {
    const { transacao_id, comprovante_ids } = req.body;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const stmt = db.prepare('UPDATE comprovantes SET transacao_id = ?, status = "auditado" WHERE id = ?');
        comprovante_ids.forEach(id => stmt.run(transacao_id, id));
        stmt.finalize(() => {
            db.run('UPDATE transacoes_bancarias SET conciliado = 1 WHERE id = ?', [transacao_id], (err) => {
                if (err) { db.run('ROLLBACK'); return res.status(500).json({ error: 'Erro ao vincular' }); }
                db.run('COMMIT');
                res.json({ success: true });
            });
        });
    });
});

// POST /api/reconciliation/reject - Rejeitar comprovante
router.post('/reject', (req, res) => {
    const { comprovante_id, motivo } = req.body;
    db.run(`UPDATE comprovantes SET status = 'rejeitado' WHERE id = ?`, [comprovante_id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;
