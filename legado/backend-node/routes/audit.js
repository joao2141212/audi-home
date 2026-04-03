const express = require('express');
const { db } = require('../config/database');

const router = express.Router();

// CNAE Map for compliance
const CNAE_MAP = {
    'TI': ['62', '63'], 'LIMPEZA': ['81', '38'], 'MANUTENCAO': ['43', '33'],
    'ADMINISTRATIVO': ['82', '69', '70'], 'OBRA': ['41', '42', '43']
};

function isCnaeCompatible(natureza, cnaeFull) {
    if (!natureza || !cnaeFull) return true;
    const cat = natureza.toUpperCase();
    const allowedPrefixes = CNAE_MAP[cat];
    if (!allowedPrefixes) return true;
    return allowedPrefixes.includes(String(cnaeFull).substring(0, 2));
}

// POST /api/audit/save - Salvar resultado de auditoria
router.post('/save', (req, res) => {
    const { transactionId, status, relatorio, cnpj, razao_social } = req.body;
    db.run(`UPDATE transacoes_bancarias SET audit_status = ?, audit_report = ? WHERE id = ?`,
        [status.toLowerCase(), relatorio, transactionId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            db.run(`INSERT OR IGNORE INTO fornecedores (cnpj, razao_social) VALUES (?, ?)`, [cnpj, razao_social]);
            res.json({ success: true });
        }
    );
});

// GET /api/reports/divergences - Relatório de divergências (Migrado e alinhado com server.js)
router.get('/reports/divergences', (req, res) => {
    const sql = `
        SELECT 
            t.id, t.data_transacao, t.descricao, t.valor, t.audit_status, t.audit_report,
            f.razao_social as fornecedor_provavel
        FROM transacoes_bancarias t
        LEFT JOIN comprovantes c ON t.id = c.transacao_id
        LEFT JOIN fornecedores f ON c.fornecedor_id = f.id
        WHERE t.audit_status IN ('alerta', 'rejeitado')
           OR (t.tipo = 'DEBIT' AND t.conciliado = 0 AND t.data_transacao < date('now', '-30 days'))
        ORDER BY t.data_transacao DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ divergencias: rows, total: rows.length });
    });
});


// GET /api/audit/ownership-report - Checagem de titularidade
router.get('/ownership-report', (req, res) => {
    const sql = `SELECT t.id as transacao_id, t.descricao as tx_desc, t.favorecido as tx_favorecido, t.valor as tx_valor, f.razao_social as nf_emissor
        FROM transacoes_bancarias t JOIN comprovantes c ON t.id = c.transacao_id JOIN fornecedores f ON c.fornecedor_id = f.id WHERE t.favorecido IS NOT NULL`;

    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const divergences = rows.filter(r => {
            if (!r.tx_favorecido || !r.nf_emissor) return false;
            const fav = r.tx_favorecido.toLowerCase();
            const emissor = r.nf_emissor.toLowerCase();
            return !fav.includes(emissor) && !emissor.includes(fav);
        });
        res.json({ ownership_divergences: divergences });
    });
});

// GET /api/audit/export/laudo - Exportar laudo final
router.get('/export/laudo', (req, res) => {
    const data = { condominio: "AUDI HOME", periodo: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }), findings: [] };

    db.serialize(() => {
        db.all(`SELECT descricao, valor FROM transacoes_bancarias WHERE tipo = 'DEBIT' AND conciliado = 0`, (err, rows) => {
            if (rows?.length) data.findings.push(`❌ DESPESAS SEM COMPROVANTE: ${rows.length} itens`);

            db.all(`SELECT audit_report FROM transacoes_bancarias WHERE audit_status NOT IN ('pendente', 'ok')`, (err, rows) => {
                if (rows?.length) data.findings.push(`⚠️ ALERTAS RFB/CNAE: ${rows.length} fornecedores`);

                let reportText = `LAUDO DE AUDITORIA - ${data.condominio}\nCompetência: ${data.periodo}\n${'='.repeat(40)}\n\n`;
                reportText += data.findings.length ? data.findings.map(f => `- ${f}`).join('\n') : '✅ NENHUMA IRREGULARIDADE';
                reportText += `\n\nGerado em ${new Date().toLocaleString('pt-BR')}`;

                res.setHeader('Content-Type', 'text/plain');
                res.send(reportText);
            });
        });
    });
});

module.exports = router;
