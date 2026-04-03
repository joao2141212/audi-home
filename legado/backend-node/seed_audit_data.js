const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./local_audi_home.db');

db.serialize(() => {
    console.log('🌱 Semeando dados (v7 - Full audit suite)...');

    db.run("DELETE FROM orcamento_anual");
    db.run("DELETE FROM boletos_emitidos");
    db.run("DELETE FROM reserva_config");
    db.run("DELETE FROM reserva_movimentacoes");
    db.run("DELETE FROM fornecedores");
    db.run("DELETE FROM comprovantes");
    db.run("DELETE FROM transacoes_bancarias");

    db.run("DELETE FROM sqlite_sequence WHERE name IN ('fornecedores', 'comprovantes', 'transacoes_bancarias')");

    db.run("INSERT INTO fornecedores (razao_social, cnpj) VALUES ('ELEVADORES LTDA', '12345678901234')", function () {
        const suppId1 = this.lastID;
        db.run("INSERT INTO fornecedores (razao_social, cnpj) VALUES ('PINTURA ME', '11222333000100')", function () {
            const suppId2 = this.lastID;

            db.run("INSERT INTO comprovantes (user_id, fornecedor_id, data_emissao, valor, descricao, status) VALUES (1, ?, '2026-01-15', 2500, 'NF Elevadores', 'auditado')", [suppId1], function () {
                const receiptId1 = this.lastID;
                db.run("INSERT INTO comprovantes (user_id, fornecedor_id, data_emissao, valor, descricao, status) VALUES (1, ?, '2026-01-20', 1200, 'NF Pintura', 'auditado')", [suppId2], function () {
                    const receiptId2 = this.lastID;

                    db.run("INSERT INTO transacoes_bancarias (data_transacao, descricao, valor, tipo, conciliado, favorecido, documento_favorecido) VALUES ('2026-01-15', 'PAGTO ELEVADORES', -2500, 'DEBIT', 1, 'ELEVADORES LTDA', '12345678901234')", function () {
                        const txId1 = this.lastID;
                        db.run("UPDATE comprovantes SET transacao_id = ? WHERE id = ?", [txId1, receiptId1], function () {

                            db.run("INSERT INTO transacoes_bancarias (data_transacao, descricao, valor, tipo, conciliado, favorecido, documento_favorecido) VALUES ('2026-01-20', 'PIX ENVIADO MANOEL', -1200, 'DEBIT', 1, 'MANOEL SILVA', '98765432100')", function () {
                                const txId2 = this.lastID;
                                db.run("UPDATE comprovantes SET transacao_id = ? WHERE id = ?", [txId2, receiptId2], function () {

                                    db.run("INSERT INTO transacoes_bancarias (data_transacao, descricao, valor, tipo, conciliado) VALUES ('2026-01-25', 'PAGTO LUZ - MULTA ATRASO', -550, 'DEBIT', 0)", function () {

                                        db.run("INSERT INTO transacoes_bancarias (data_transacao, descricao, valor, tipo, audit_status, audit_report) VALUES ('2026-01-28', 'MÃO DE OBRA - PEDRO PEDREIRO', -2000, 'DEBIT', 'alerta', 'CNPJ do fornecedor consta como BAIXADO na Receita Federal.')", function () {

                                            // Revenue Discrepancy Case
                                            db.run("INSERT INTO boletos_emitidos (pagador, valor, status, user_id) VALUES ('Unidade 101', 5000, 'pago', 1)");
                                            db.run("INSERT INTO boletos_emitidos (pagador, valor, status, user_id) VALUES ('Unidade 102', 5000, 'pago', 1)");
                                            db.run("INSERT INTO transacoes_bancarias (data_transacao, descricao, valor, tipo) VALUES ('2026-01-30', 'REPASSE ADM CONDOMINIO', 9000, 'CREDIT')", function () {
                                                console.log('✅ Base completa v7 pronta!');
                                                process.exit(0);
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});
