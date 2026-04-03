const express = require('express');
const { db } = require('../config/database');

const router = express.Router();

// GET /api/dashboard/stats - Estatísticas do dashboard
router.get('/stats', (req, res) => {
    const stats = {
        orcamento_anual: 0,
        despesas_totais: 0,
        fundo_reserva: 0,
        grafico_dados: [],
        alertas: [],
        ultima_atualizacao: new Date().toISOString()
    };

    db.serialize(() => {
        db.get(`SELECT SUM(valor_planejado) as total FROM orcamento_anual`, (err, row) => {
            if (row) stats.orcamento_anual = (row.total || 0) * 12;

            db.get(`SELECT SUM(ABS(valor)) as total FROM transacoes_bancarias WHERE tipo = 'DEBIT'`, (err, row) => {
                if (row) stats.despesas_totais = row.total || 0;

                db.get(`SELECT 
                    (SELECT COALESCE(saldo_inicial, 0) FROM reserva_config LIMIT 1) as inicial,
                    (SELECT SUM(valor) FROM reserva_movimentacoes WHERE tipo IN ('DEPOSITO', 'RENDIMENTO')) as entradas,
                    (SELECT SUM(valor) FROM reserva_movimentacoes WHERE tipo = 'SAQUE') as saidas`, (err, row) => {
                    if (row) stats.fundo_reserva = (row.inicial || 0) + (row.entradas || 0) - (row.saidas || 0);

                    db.all(`
                        SELECT 'Conformidade' as cat, descricao as title, audit_report as desc, audit_status as sev 
                        FROM transacoes_bancarias WHERE audit_status IN ('alerta', 'rejeitado')
                        UNION ALL
                        SELECT 'Financeiro' as cat, 'Juros Detectados' as title, descricao as desc, 'high' as sev 
                        FROM transacoes_bancarias WHERE descricao LIKE '%JUROS%' OR descricao LIKE '%MULTA%'
                        LIMIT 5
                    `, (err, alerts) => {
                        if (alerts) {
                            stats.alertas = alerts.map(a => ({
                                title: a.title,
                                description: a.desc,
                                severity: a.sev === 'rejeitado' ? 'critical' : 'high',
                                created_at: new Date().toISOString()
                            }));
                        }

                        db.all(`
                            SELECT 
                                strftime('%m', data_transacao) as mes,
                                SUM(CASE WHEN tipo = 'CREDIT' THEN ABS(valor) ELSE 0 END) as receitas,
                                SUM(CASE WHEN tipo = 'DEBIT' THEN ABS(valor) ELSE 0 END) as despesas
                            FROM transacoes_bancarias
                            GROUP BY mes ORDER BY mes DESC LIMIT 6
                        `, (err, chartRows) => {
                            if (chartRows) {
                                const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                                stats.grafico_dados = chartRows.map(row => ({
                                    name: meses[parseInt(row.mes) - 1],
                                    receitas: row.receitas || 0,
                                    despesas: row.despesas || 0
                                })).reverse();
                            }
                            res.json(stats);
                        });
                    });
                });
            });
        });
    });
});

module.exports = router;
