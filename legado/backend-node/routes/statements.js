const express = require('express');
const crypto = require('crypto');
const { db } = require('../config/database');

const router = express.Router();

// POST /api/statements/validate - Pré-validação de duplicidade
router.post('/validate', (req, res) => {
    const { file_content_base64, periodo_inicio, periodo_fim, instituicao } = req.body;

    // 1. Hash check
    if (file_content_base64) {
        const fileHash = crypto.createHash('sha256').update(file_content_base64).digest('hex');
        db.get('SELECT hash FROM file_hashes WHERE hash = ?', [fileHash], (err, row) => {
            if (row) {
                return res.json({
                    isDuplicate: true,
                    reason: 'HASH_EXISTENTE',
                    message: 'ESTE ARQUIVO EXATO JÁ FOI IMPORTADO ANTERIORMENTE.'
                });
            }
            checkBusinessLogic();
        });
    } else {
        checkBusinessLogic();
    }

    function checkBusinessLogic() {
        // 2. Period check
        const sql = `SELECT id FROM extratos_bancarios WHERE periodo_inicio = ? AND periodo_fim = ? AND instituicao = ?`;
        db.get(sql, [periodo_inicio, periodo_fim, instituicao], (err, row) => {
            if (row) {
                return res.json({
                    isDuplicate: true,
                    reason: 'PERIODO_EXISTENTE',
                    message: 'JÁ EXISTE UM EXTRATO PARA ESTE PERÍODO E INSTITUIÇÃO.'
                });
            }
            res.json({ isDuplicate: false });
        });
    }
});

// POST /api/statements/save - Salvar extrato com anti-duplicidade
router.post('/save', (req, res) => {
    const { arquivo_nome, periodo_inicio, periodo_fim, instituicao, transacoes, user_id, file_content_base64 } = req.body;

    // Hash check
    if (file_content_base64) {
        const fileHash = crypto.createHash('sha256').update(file_content_base64).digest('hex');
        db.get('SELECT hash FROM file_hashes WHERE hash = ?', [fileHash], (err, row) => {
            if (row) {
                return res.status(409).json({ error: 'DUPLICIDADE: Este arquivo exato já foi importado anteriormente.' });
            }
            proceedToBusinessCheck(fileHash);
        });
    } else {
        proceedToBusinessCheck(null);
    }

    function proceedToBusinessCheck(fileHashToSave) {
        const checkDupeQuery = `SELECT id FROM extratos_bancarios WHERE periodo_inicio = ? AND periodo_fim = ? AND instituicao = ?`;
        db.get(checkDupeQuery, [periodo_inicio, periodo_fim, instituicao], (err, row) => {
            if (row) {
                return res.status(409).json({
                    error: 'DUPLICIDADE: Já existe um extrato para este período.',
                    duplicate_id: row.id
                });
            }
            saveStatementToDb(fileHashToSave);
        });
    }

    function saveStatementToDb(fileHashToSave) {
        const total_creditos = transacoes.filter(t => t.tipo === 'CREDIT').reduce((acc, t) => acc + Number(t.valor), 0);
        const total_debitos = transacoes.filter(t => t.tipo === 'DEBIT').reduce((acc, t) => acc + Math.abs(Number(t.valor)), 0);

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            db.run(`INSERT INTO extratos_bancarios (user_id, arquivo_nome, periodo_inicio, periodo_fim, instituicao, total_creditos, total_debitos)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [user_id || 1, arquivo_nome, periodo_inicio, periodo_fim, instituicao, total_creditos, total_debitos],
                function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Erro ao salvar extrato' });
                    }

                    const extratoId = this.lastID;

                    if (fileHashToSave) {
                        db.run('INSERT INTO file_hashes (hash, file_path) VALUES (?, ?)', [fileHashToSave, arquivo_nome]);
                    }

                    const stmt = db.prepare(`INSERT INTO transacoes_bancarias (extrato_id, data_transacao, descricao, valor, tipo, favorecido, documento_favorecido)
                        VALUES (?, ?, ?, ?, ?, ?, ?)`);

                    transacoes.forEach(tx => {
                        if (!tx.data || !tx.descricao || tx.valor === undefined) return;
                        stmt.run(extratoId, tx.data, tx.descricao, tx.valor, tx.tipo, tx.favorecido || null, tx.documento_favorecido || null);
                    });

                    stmt.finalize(() => {
                        db.run('COMMIT');
                        res.json({ success: true, extrato_id: extratoId });
                    });
                }
            );
        });
    }
});

// GET /api/statements - Listar extratos
router.get('/', (req, res) => {
    db.all(`SELECT * FROM extratos_bancarios ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

module.exports = router;
