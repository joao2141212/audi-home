const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = 3001;
const DB_PATH = path.join(__dirname, 'local_audi_home.db');

// Configuração do App
app.use(cors());
app.use(express.json());

// Conexão com Banco de Dados (SQLite)
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ Erro ao conectar no SQLite:', err.message);
    } else {
        console.log('📦 Conectado ao banco de dados SQLite local.');
    }
});

// Inicialização das Tabelas (Schema)
db.serialize(() => {
    // Tabela de Condomínios (Tenant)
    db.run(`CREATE TABLE IF NOT EXISTS condominios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        cnpj TEXT UNIQUE,
        endereco TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de Usuários (Com Role e Tenant)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password_hash TEXT,
        name TEXT,
        role TEXT DEFAULT 'sindico', -- 'master', 'sindico', 'funcionario'
        condominio_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(condominio_id) REFERENCES condominios(id)
    )`);

    // Tabela de Audit Logs (Rastreabilidade)
    db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        condominio_id INTEGER,
        action TEXT, -- 'DELETE_RECEIPT', 'UPDATE_BUDGET', etc.
        target_table TEXT,
        target_id INTEGER,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(condominio_id) REFERENCES condominios(id)
    )`);

    // Tabela de Extratos
    db.run(`CREATE TABLE IF NOT EXISTS extratos_bancarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        arquivo_nome TEXT,
        periodo_inicio DATE,
        periodo_fim DATE,
        instituicao TEXT,
        total_creditos REAL DEFAULT 0,
        total_debitos REAL DEFAULT 0,
        status TEXT DEFAULT 'processado',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Tabela de Transações
    db.run(`CREATE TABLE IF NOT EXISTS transacoes_bancarias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        extrato_id INTEGER,
        data_transacao DATE,
        descricao TEXT,
        valor REAL,
        tipo TEXT, 
        conciliado BOOLEAN DEFAULT 0,
        audit_status TEXT DEFAULT 'pendente',
        audit_report TEXT,
        favorecido TEXT,
        documento_favorecido TEXT,
        FOREIGN KEY(extrato_id) REFERENCES extratos_bancarios(id) ON DELETE CASCADE
    )`);

    // Tabela de Fornecedores
    db.run(`CREATE TABLE IF NOT EXISTS fornecedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cnpj TEXT UNIQUE,
        razao_social TEXT,
        nome_fantasia TEXT,
        situacao_cadastral TEXT,
        cnae_principal TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de Comprovantes (Receipts)
    db.run(`CREATE TABLE IF NOT EXISTS comprovantes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        fornecedor_id INTEGER,
        data_emissao DATE,
        valor REAL,
        descricao TEXT,
        arquivo_nome TEXT,
        status TEXT DEFAULT 'pendente',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        transacao_id INTEGER,
        natureza_servico TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(fornecedor_id) REFERENCES fornecedores(id),
        FOREIGN KEY(transacao_id) REFERENCES transacoes_bancarias(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS orcamento_anual (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        categoria TEXT,
        valor_planejado REAL,
        ano INTEGER,
        user_id INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS boletos_emitidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pagador TEXT,
        valor REAL,
        vencimento DATE,
        status TEXT DEFAULT 'aberto',
        data_pagamento DATE,
        user_id INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS reserva_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        valor_mensal_programado REAL,
        saldo_inicial REAL,
        user_id INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);


    db.run(`CREATE TABLE IF NOT EXISTS reserva_movimentacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT, -- 'DEPOSITO', 'SAQUE', 'RENDIMENTO'
        valor REAL,
        data_movimentacao DATE,
        descricao TEXT,
        user_id INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Tabela de Antecipações
    db.run(`CREATE TABLE IF NOT EXISTS antecipacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        data_operacao DATE,
        valor_original REAL, -- Valor de face
        valor_liquido REAL, -- Valor recebido (crédito)
        taxa_servico REAL, -- Diferença (taxa)
        instituicao TEXT,
        status TEXT DEFAULT 'pendente', -- 'conciliado', 'pendente'
        transacao_id INTEGER, -- Link para o crédito bancário
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(transacao_id) REFERENCES transacoes_bancarias(id)
    )`);

    // Seed Condominio Padrão
    db.run(`INSERT OR IGNORE INTO condominios (id, nome, cnpj) VALUES (1, 'Condomínio Solar', '12.345.678/0001-90')`);

    // Seed Admin User (Master)
    const adminEmail = 'admin@audi.com';
    const adminPass = 'admin';
    db.get(`SELECT id FROM users WHERE email = ?`, [adminEmail], async (err, row) => {
        if (!row) {
            const hash = await bcrypt.hash(adminPass, 10);
            db.run(`INSERT INTO users (email, password_hash, name, role, condominio_id) VALUES (?, ?, ?, 'master', 1)`,
                [adminEmail, hash, 'Gestor Master'],
                (err) => {
                    if (!err) console.log('👤 Usuário Admin criado: admin@audi.com / admin (Mater)');
                }
            );
        }
    });

    console.log('✅ Tabelas verificadas/criadas.');
});

// ================= CONFIGURAÇÃO DE AUDITORIA =================
const CNAE_MAP = {
    'TI': ['62', '63'],
    'LIMPEZA': ['81', '38'],
    'MANUTENCAO': ['43', '33'],
    'ADMINISTRATIVO': ['82', '69', '70'],
    'OBRA': ['41', '42', '43']
};

function isCnaeCompatible(natureza, cnaeFull) {
    if (!natureza || !cnaeFull) return true; // Ignora se não houver dados
    const cat = natureza.toUpperCase();
    const allowedPrefixes = CNAE_MAP[cat];
    if (!allowedPrefixes) return true; // Categoria desconhecida

    const cnae = String(cnaeFull).substring(0, 2);
    return allowedPrefixes.includes(cnae);
}

// ================= SERVIÇOS EXTERNOS =================
async function lookupBrasilAPI(cnpj) {
    const cleanCnpj = cnpj.replace(/\D/g, '');
    try {
        console.log(`📡 [RFB] Consultando BrasilAPI para CNPJ: ${cleanCnpj}`);
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, {
            headers: { 'User-Agent': 'AudiHomeAuditBot/1.0' }
        });
        if (!response.ok) {
            console.warn(`⚠️ [RFB] Falha na consulta (Status: ${response.status})`);
            return null;
        }
        return await response.json();
    } catch (err) {
        console.error('❌ [RFB] Erro de conexão:', err.message);
        return null;
    }
}

const crypto = require('crypto');

// 4. Validação Prévia de Duplicidade (Endpoint leve para a UI checar antes de salvar)
app.post('/api/receipts/validate', (req, res) => {
    const { cnpj, data_emissao, valor, file_content_base64 } = req.body;

    // 1. Check Hash
    if (file_content_base64) {
        const fileHash = crypto.createHash('sha256').update(file_content_base64).digest('hex');
        db.get('SELECT hash FROM file_hashes WHERE hash = ?', [fileHash], (err, row) => {
            if (row) return res.json({
                isDuplicate: true,
                reason: 'HASH_EXISTENTE',
                message: 'ESTE ARQUIVO JÁ FOI ENVIADO ANTERIORMENTE.'
            });

            // Se passar no hash, checa lógica de negócio
            checkBusinessLogic();
        });
    } else {
        checkBusinessLogic();
    }

    function checkBusinessLogic() {
        // 2. Check Dados (CNPJ + Data + Valor)
        const sql = `
            SELECT c.id FROM comprovantes c 
            JOIN fornecedores f ON c.fornecedor_id = f.id 
            WHERE f.cnpj = ? AND c.data_emissao = ? AND c.valor = ? AND c.status != 'rejeitado'
        `;
        db.get(sql, [cnpj, data_emissao, valor], (err, row) => {
            if (row) {
                return res.json({
                    isDuplicate: true,
                    reason: 'DADOS_EXISTENTES',
                    message: 'JÁ EXISTE UM COMPROVANTE COM ESTE CNPJ, DATA E VALOR.'
                });
            }
            res.json({ isDuplicate: false });
        });
    }
});

// 5. Salvar Comprovante (Com Auto-Auditoria Real e Anti-Duplicidade)
app.post('/api/receipts/save', (req, res) => {
    const { cnpj, razao_social, data_emissao, valor, descricao, natureza_servico, arquivo_nome, user_id, file_content_base64 } = req.body;

    // --- CAMADA 1: HASH DO ARQUIVO (Prevenir Upload Idêntico) ---
    // Se o frontend mandar o conteúdo base64, geramos um hash único
    if (file_content_base64) {
        const fileHash = crypto.createHash('sha256').update(file_content_base64).digest('hex');

        db.get('SELECT hash FROM file_hashes WHERE hash = ?', [fileHash], (err, row) => {
            if (row) {
                return res.status(409).json({ error: 'DUPLICIDADE: Este arquivo exato já foi enviado anteriormente.' });
            }
            // Se não existe, salva o hash (mas só commita no final da transação)
            db.run('INSERT INTO file_hashes (hash, file_path) VALUES (?, ?)', [fileHash, arquivo_nome]);
        });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // --- CAMADA 2: LÓGICA DE NEGÓCIO (Mesmo CNPJ + Data + Valor) ---
        // Verifica se já existe um comprovante com os mesmos dados vitais
        // Isso pega casos onde a pessoa tira outra foto do mesmo papel (arquivo diferente, dados iguais)
        const checkDupeQuery = `
            SELECT c.id FROM comprovantes c 
            JOIN fornecedores f ON c.fornecedor_id = f.id 
            WHERE f.cnpj = ? AND c.data_emissao = ? AND c.valor = ? AND c.status != 'rejeitado'
        `;

        db.get(checkDupeQuery, [cnpj, data_emissao, valor], (err, row) => {
            if (row) {
                db.run('ROLLBACK');
                return res.status(409).json({
                    error: 'SUSPEITA DE FRAUDE: Já existe um comprovante aprovado com este CNPJ, Data e Valor.',
                    duplicate_id: row.id
                });
            }

            // 1. Upsert Fornecedor (Continua fluxo normal...)
            db.run(`INSERT OR IGNORE INTO fornecedores (cnpj, razao_social) VALUES (?, ?)`,
                [cnpj, razao_social],
                async function (err) {
                    if (err) {
                        console.error(err);
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Erro ao salvar fornecedor' });
                    }

                    // Pega o ID
                    db.get(`SELECT id, situacao_cadastral FROM fornecedores WHERE cnpj = ?`, [cnpj], async (err, row) => {
                        if (err || !row) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Fornecedor não encontrado' });
                        }

                        const fornecedorId = row.id;

                        // --- AUDITORIA REAL RFB (Background) ---
                        if (!row.situacao_cadastral) {
                            const rfbData = await lookupBrasilAPI(cnpj);
                            if (rfbData) {
                                console.log(`✅ [RFB] Dados recebidos: ${rfbData.razao_social} - Status: ${rfbData.descricao_situacao_cadastral}`);
                                db.run(`UPDATE fornecedores SET 
                                razao_social = ?, 
                                nome_fantasia = ?, 
                                situacao_cadastral = ?, 
                                cnae_principal = ?,
                                updated_at = CURRENT_TIMESTAMP
                                WHERE id = ?`,
                                    [rfbData.razao_social, rfbData.nome_fantasia, rfbData.descricao_situacao_cadastral, rfbData.cnae_fiscal, fornecedorId]
                                );
                            }
                        }

                        // 2. Insert Comprovante
                        db.run(`INSERT INTO comprovantes 
                        (user_id, fornecedor_id, data_emissao, valor, descricao, natureza_servico, arquivo_nome, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente')`,
                            [user_id || 1, fornecedorId, data_emissao, valor, descricao, natureza_servico, arquivo_nome],
                            function (err) {
                                if (err) {
                                    console.error(err);
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: 'Erro ao salvar comprovante' });
                                }
                                db.run('COMMIT');
                                res.json({ success: true, id: this.lastID });
                            }
                        );
                    });
                }
            );
        });
    });
});

// 6. Listar Comprovantes
app.get('/api/receipts', (req, res) => {
    const sql = `
        SELECT c.*, f.razao_social, f.cnpj 
        FROM comprovantes c
        LEFT JOIN fornecedores f ON c.fornecedor_id = f.id
        ORDER BY c.data_emissao DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});


// 1. Criar Usuário
app.post('/api/auth/register', async (req, res) => {
    const { email, password, name } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)`,
            [email, hash, name],
            function (err) {
                if (err) return res.status(400).json({ error: 'Email já existe' });
                res.json({ id: this.lastID, email, name });
            }
        );
    } catch (e) {
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

// 2. Login Simples (Retorna o ID do usuário para "sessão")
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    console.log('🔐 [LOGIN] Tentativa de login:', email);

    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) {
            console.error('❌ [LOGIN] Erro no DB:', err);
            return res.status(401).json({ error: 'Erro no servidor' });
        }

        if (!user) {
            console.log('❌ [LOGIN] Usuário não encontrado:', email);
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }

        console.log('✅ [LOGIN] Usuário encontrado:', user.email);
        console.log('🔑 [LOGIN] Comparando senhas...');

        const match = await bcrypt.compare(password, user.password_hash);
        console.log('🔑 [LOGIN] Match:', match);

        if (match) {
            console.log('✅ [LOGIN] Login bem-sucedido!');
            res.json({ id: user.id, email: user.email, name: user.name });
        } else {
            console.log('❌ [LOGIN] Senha incorreta');
            res.status(401).json({ error: 'Senha incorreta' });
        }
    });
});

// 3. Salvar Extrato e Transações
// 3. Salvar Extrato e Transações (Com Anti-Duplicidade)
app.post('/api/statements/save', (req, res) => {
    const { arquivo_nome, periodo_inicio, periodo_fim, instituicao, transacoes, user_id, file_content_base64 } = req.body;

    // --- CAMADA 1: HASH DO ARQUIVO ---
    if (file_content_base64) {
        const fileHash = crypto.createHash('sha256').update(file_content_base64).digest('hex');

        db.get('SELECT hash FROM file_hashes WHERE hash = ?', [fileHash], (err, row) => {
            if (row) {
                return res.status(409).json({ error: 'DUPLICIDADE: Este arquivo exato já foi importado anteriormente.' });
            }

            // Segue para camada 2 se não houver hash
            proceedToBusinessCheck(fileHash);
        });
    } else {
        proceedToBusinessCheck(null);
    }

    function proceedToBusinessCheck(fileHashToSave) {
        // --- CAMADA 2: LÓGICA DE NEGÓCIO (Mesmo Período e Instituição) ---
        const checkDupeQuery = `
                SELECT id FROM extratos_bancarios 
                WHERE periodo_inicio = ? AND periodo_fim = ? AND instituicao = ?
            `;

        db.get(checkDupeQuery, [periodo_inicio, periodo_fim, instituicao], (err, row) => {
            if (row) {
                return res.status(409).json({
                    error: 'DUPLICIDADE: Já existe um extrato importado para este período exato.',
                    duplicate_id: row.id
                });
            }

            // Se passou nas duas camadas, salva
            saveStatementToDb(fileHashToSave);
        });
    }

    function saveStatementToDb(fileHashToSave) {
        const total_creditos = transacoes
            .filter(t => t.tipo === 'CREDIT')
            .reduce((acc, t) => acc + Number(t.valor), 0);

        const total_debitos = transacoes
            .filter(t => t.tipo === 'DEBIT')
            .reduce((acc, t) => acc + Math.abs(Number(t.valor)), 0);

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            db.run(`INSERT INTO extratos_bancarios 
                (user_id, arquivo_nome, periodo_inicio, periodo_fim, instituicao, total_creditos, total_debitos)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [user_id || 1, arquivo_nome, periodo_inicio, periodo_fim, instituicao, total_creditos, total_debitos],
                function (err) {
                    if (err) {
                        console.error(err);
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Erro ao salvar extrato' });
                    }

                    const extratoId = this.lastID;

                    // Salva Hash se existir
                    if (fileHashToSave) {
                        db.run('INSERT INTO file_hashes (hash, file_path) VALUES (?, ?)', [fileHashToSave, arquivo_nome]);
                    }

                    const stmt = db.prepare(`INSERT INTO transacoes_bancarias 
                        (extrato_id, data_transacao, descricao, valor, tipo, favorecido, documento_favorecido) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)`);

                    let errorsCount = 0;
                    transacoes.forEach(tx => {
                        if (!tx.data || !tx.descricao || tx.valor === undefined) {
                            return;
                        }
                        stmt.run(extratoId, tx.data, tx.descricao, tx.valor, tx.tipo, tx.favorecido || null, tx.documento_favorecido || null, (err) => {
                            if (err) errorsCount++;
                        });
                    });

                    stmt.finalize(() => {
                        db.run('COMMIT');
                        if (errorsCount > 0) {
                            console.warn(`⚠️ [DB] Extrato salvo com ${errorsCount} erros de transação.`);
                        }
                        res.json({ success: true, extrato_id: extratoId });
                    });
                }
            );
        });
    }
});

// 8. Listar Todas as Transações
app.get('/api/transactions', (req, res) => {
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
        res.json({ transactions: rows }); // Return object to match frontend expectation
    });
});

// 9. Listar Despesas para Auditoria
app.get('/api/expenses', (req, res) => {
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

// 4. Listar Extratos
app.get('/api/statements', (req, res) => {
    db.all(`SELECT * FROM extratos_bancarios ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 7. Dashboard Stats (Dados REAIS do banco)
app.get('/api/dashboard/stats', (req, res) => {
    const stats = {
        orcamento_anual: 0,
        despesas_totais: 0,
        fundo_reserva: 0,
        grafico_dados: [],
        alertas: [],
        ultima_atualizacao: new Date().toISOString()
    };

    db.serialize(() => {
        // 1. Orçamento Anual (Soma do planejado x 12 para estimativa anual)
        db.get(`SELECT SUM(valor_planejado) as total FROM orcamento_anual`, (err, row) => {
            if (row) stats.orcamento_anual = (row.total || 0) * 12;

            // 2. Despesas Totais (Somatório de débitos)
            db.get(`SELECT SUM(ABS(valor)) as total FROM transacoes_bancarias WHERE tipo = 'DEBIT'`, (err, row) => {
                if (row) stats.despesas_totais = row.total || 0;

                // 3. Fundo de Reserva (Saldo Final)
                db.get(`SELECT 
                    (SELECT COALESCE(saldo_inicial, 0) FROM reserva_config LIMIT 1) as inicial,
                    (SELECT SUM(valor) FROM reserva_movimentacoes WHERE tipo IN ('DEPOSITO', 'RENDIMENTO')) as entradas,
                    (SELECT SUM(valor) FROM reserva_movimentacoes WHERE tipo = 'SAQUE') as saidas`, (err, row) => {

                    if (row) {
                        stats.fundo_reserva = (row.inicial || 0) + (row.entradas || 0) - (row.saidas || 0);
                    }

                    // 4. Alertas de Auditoria (RFB + NF Faltante + Juros)
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
                                severity: a.sev === 'rejeitado' ? 'critical' : a.sev === 'alerta' ? 'high' : 'medium',
                                created_at: new Date().toISOString()
                            }));
                        }

                        // 5. Gráfico (Receitas vs Despesas reais)
                        db.all(`
                            SELECT 
                                strftime('%m', data_transacao) as mes,
                                SUM(CASE WHEN tipo = 'CREDIT' THEN ABS(valor) ELSE 0 END) as receitas,
                                SUM(CASE WHEN tipo = 'DEBIT' THEN ABS(valor) ELSE 0 END) as despesas
                            FROM transacoes_bancarias
                            GROUP BY mes
                            ORDER BY mes DESC
                            LIMIT 6
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

// 10. Reconciliação - Fila de Comprovantes Pendentes
app.get('/api/reconciliation/queue', (req, res) => {
    const sql = `
        SELECT 
            c.id, 
            c.valor, 
            c.data_emissao as data, 
            f.razao_social as unidade,
            c.status,
            c.arquivo_nome
        FROM comprovantes c
        JOIN fornecedores f ON c.fornecedor_id = f.id
        WHERE c.transacao_id IS NULL
        ORDER BY c.data_emissao DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const queue = rows.map(r => ({ ...r, matchCount: 1, prioridade: 5, ocrConfianca: 90 }));
        res.json({ queue });
    });
});

// 11. Reconciliação - Buscar Matches para um Comprovante
app.get('/api/reconciliation/matches/:id', (req, res) => {
    const receiptId = req.params.id;

    db.get('SELECT valor FROM comprovantes WHERE id = ?', [receiptId], (err, receipt) => {
        if (err || !receipt) return res.status(404).json({ error: 'Comprovante não encontrado' });

        const sql = `
            SELECT 
                id, 
                valor, 
                data_transacao as data, 
                descricao,
                CASE WHEN valor = ? THEN 100 ELSE 85 END as matchScore
            FROM transacoes_bancarias
            WHERE tipo = 'DEBIT' 
              AND ABS(ABS(valor) - ABS(?)) < (ABS(?) * 0.05)
              AND id NOT IN (SELECT IFNULL(transacao_id, 0) FROM comprovantes WHERE transacao_id IS NOT NULL)
            ORDER BY matchScore DESC, data_transacao DESC
        `;

        db.all(sql, [receipt.valor, receipt.valor, receipt.valor], (err, matches) => {
            if (err) return res.status(500).json({ error: err.message });
            const formattedMatches = (matches || []).map(m => ({
                id: m.id.toString(),
                valor: Math.abs(m.valor),
                data: m.data,
                descricao: m.descricao,
                matchScore: m.matchScore,
                matchReasons: m.matchScore === 100 ? ['Valor exato'] : ['Valor aproximado']
            }));
            res.json({ matches: formattedMatches });
        });
    });
});

// 12. Reconciliação - Aprovar Match
app.post('/api/reconciliation/approve', (req, res) => {
    const { receiptId, transactionId } = req.body;
    db.run(`UPDATE comprovantes SET transacao_id = ?, status = 'auditado' WHERE id = ?`, [transactionId, receiptId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`UPDATE transacoes_bancarias SET conciliado = 1 WHERE id = ?`, [transactionId]);
        res.json({ success: true });
    });
});

// 13. Reconciliação - Vincular (Aprovar) Multi
app.post('/api/reconciliation/link-multi', (req, res) => {
    const { comprovante_ids, transacao_id } = req.body;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Atualiza todos os comprovantes para apontar para a mesma transação
        const placeholders = comprovante_ids.map(() => '?').join(',');
        db.run(`UPDATE comprovantes SET transacao_id = ?, status = 'auditado' WHERE id IN (${placeholders})`,
            [transacao_id, ...comprovante_ids],
            function (err) {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: err.message });
                }

                // Marca transação como conciliada
                db.run('UPDATE transacoes_bancarias SET conciliado = 1 WHERE id = ?', [transacao_id], function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: err.message });
                    }
                    db.run('COMMIT');
                    res.json({ success: true, count: comprovante_ids.length });
                });
            }
        );
    });
});

// 14. Reconciliação - Rejeitar Comprovante
app.post('/api/reconciliation/reject', (req, res) => {
    const { comprovante_id, motivo } = req.body;
    db.run(`UPDATE comprovantes SET status = 'rejeitado', audit_report = ? WHERE id = ?`,
        [motivo || 'Rejeitado manualmente na reconciliação', comprovante_id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// 15. Auditoria - Salvar Resultado
app.post('/api/audit/save', (req, res) => {
    const { transactionId, status, relatorio, cnpj, razao_social } = req.body;

    // 1. Atualiza a transação com o status da auditoria
    db.run(`UPDATE transacoes_bancarias SET audit_status = ?, audit_report = ? WHERE id = ?`,
        [status.toLowerCase(), relatorio, transactionId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });

            // 2. Tenta salvar o fornecedor se ele não existir
            db.run(`INSERT OR IGNORE INTO fornecedores (cnpj, razao_social) VALUES (?, ?)`,
                [cnpj, razao_social],
                function (err) {
                    // Ignoramos erro de fornecedor pois o importante era a transação
                    res.json({ success: true, updated: this.changes });
                }
            );
        }
    );
});

// 14. Orçamento Anual
app.get('/api/budget', (req, res) => {
    db.all(`SELECT * FROM orcamento_anual ORDER BY categoria ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ budget: rows });
    });
});

app.post('/api/budget/save', (req, res) => {
    const { categoria, valor_planejado, ano } = req.body;
    db.run(`INSERT INTO orcamento_anual (categoria, valor_planejado, ano, user_id) VALUES (?, ?, ?, ?)`,
        [categoria, valor_planejado, ano || 2026, 1],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});


// 15. Receitas (Boletos)
app.get('/api/revenue/boletos', (req, res) => {
    db.all(`SELECT * FROM boletos_emitidos ORDER BY vencimento DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ boletos: rows });
    });
});

// 16. Antecipação de Receita
app.post('/api/anticipation/save', (req, res) => {
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

app.get('/api/anticipation', (req, res) => {
    db.all(`SELECT * FROM antecipacoes ORDER BY data_operacao DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ antecipacoes: rows });
    });
});



// 17. Relatórios Específicos
// a) Boletos Não Pagos
app.get('/api/reports/unpaid-boletos', (req, res) => {
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

// b) Relatório de Divergências (Auditoria)
app.get('/api/reports/discrepancies', (req, res) => {
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

app.post('/api/revenue/boletos/save', (req, res) => {

    const { pagador, valor, vencimento, status } = req.body;
    db.run(`INSERT INTO boletos_emitidos (pagador, valor, vencimento, status, user_id) VALUES (?, ?, ?, ?, ?)`,
        [pagador, valor, vencimento, status || 'aberto', 1],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

// 16. Fundo de Reserva
app.get('/api/reserve/config', (req, res) => {
    db.get(`SELECT * FROM reserva_config LIMIT 1`, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || { valor_mensal_programado: 0, saldo_inicial: 0 });
    });
});

app.post('/api/reserve/config/save', (req, res) => {
    const { valor_mensal_programado, saldo_inicial } = req.body;
    db.run(`DELETE FROM reserva_config`); // Simplificação: apenas uma config
    db.run(`INSERT INTO reserva_config (valor_mensal_programado, saldo_inicial, user_id) VALUES (?, ?, ?)`,
        [valor_mensal_programado, saldo_inicial, 1],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.get('/api/reserve/movimentacoes', (req, res) => {
    db.all(`SELECT * FROM reserva_movimentacoes ORDER BY data_movimentacao DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ movimentacoes: rows });
    });
});

app.post('/api/reserve/movimentacoes/save', (req, res) => {
    const { tipo, valor, data_movimentacao, descricao } = req.body;
    db.run(`INSERT INTO reserva_movimentacoes (tipo, valor, data_movimentacao, descricao, user_id) VALUES (?, ?, ?, ?, ?)`,
        [tipo, valor, data_movimentacao, descricao, 1],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

// 17. Relatório de Divergências (Compliance)
app.get('/api/audit/reports/divergences', (req, res) => {
    const report = {
        rfb_cnae: [],
        nf_faltante: [],
        juros_multa: [],
        titularidade: [],
        receita_antecipada: [],
        timestamp: new Date().toISOString()
    };

    db.serialize(() => {
        // 1. Divergências RFB/CNAE (Cruzamento Real com Situação Cadastral + CNAE)
        // Agora verifica tanto em comprovantes quanto em transações p/ cobertura total
        db.all(`SELECT f.situacao_cadastral, f.razao_social, f.cnae_principal, 
                       c.natureza_servico, c.valor as valor_nf, c.data_emissao as data,
                       t.id as transacao_id, t.descricao as tx_desc, t.audit_status
                FROM fornecedores f
                LEFT JOIN comprovantes c ON f.id = c.fornecedor_id
                LEFT JOIN transacoes_bancarias t ON c.transacao_id = t.id
                WHERE f.situacao_cadastral IS NOT NULL`, [], (err, rows) => {
            if (rows) {
                const divergences = rows.filter(r => {
                    const isInactive = r.situacao_cadastral && !['ATIVA', 'Ativa'].includes(r.situacao_cadastral);
                    const isIncompatible = r.cnae_principal && !isCnaeCompatible(r.natureza_servico, r.cnae_principal);
                    const isManualAlert = ['alerta', 'rejeitado'].includes(r.audit_status);
                    if (isInactive || isIncompatible || isManualAlert) {
                        console.log(`🚩 [AUDIT] Divergência em ${r.razao_social}: Inativo=${isInactive}, Incompatível=${isIncompatible}`);
                    }
                    return isInactive || isIncompatible || isManualAlert;
                });

                report.rfb_cnae = divergences.map(r => {
                    let msg = r.audit_status === 'alerta' ? 'Alerta Manual' : 'Alerta Cadastral';
                    if (r.situacao_cadastral && !['ATIVA', 'Ativa'].includes(r.situacao_cadastral)) {
                        msg = `Situação RFB: ${r.situacao_cadastral}`;
                    } else if (r.cnae_principal && !isCnaeCompatible(r.natureza_servico, r.cnae_principal)) {
                        msg = `CNAE Incompatível (${r.cnae_principal}) para ${r.natureza_servico}`;
                    }
                    return {
                        id: r.transacao_id || Math.random(),
                        data_transacao: r.data,
                        descricao: r.tx_desc || r.natureza_servico || 'Nota Fiscal Recebida',
                        valor: r.valor_nf,
                        audit_report: msg,
                        razao_social: r.razao_social,
                        natureza_servico: r.natureza_servico
                    };
                });
            }

            // 2. Pagamentos sem Nota Fiscal
            db.all(`SELECT t.id, t.data_transacao, t.descricao, t.valor
                    FROM transacoes_bancarias t
                    LEFT JOIN comprovantes c ON t.id = c.transacao_id
                    WHERE t.tipo = 'DEBIT' AND c.id IS NULL`, [], (err, rows) => {
                if (rows) report.nf_faltante = rows;

                // 3. Juros e Multas
                db.all(`SELECT id, data_transacao, descricao, valor
                        FROM transacoes_bancarias
                        WHERE tipo = 'DEBIT' 
                        AND (descricao LIKE '%JUROS%' OR descricao LIKE '%MULTA%' OR descricao LIKE '%ENCARGO%')`, [], (err, rows) => {
                    if (rows) report.juros_multa = rows;

                    // 4. Titularidade
                    const ownershipSql = `
                        SELECT 
                            t.id, t.data_transacao as date, t.descricao as description, t.valor as amount,
                            t.favorecido as tx_favorecido, t.documento_favorecido as tx_doc,
                            f.razao_social as nf_emissor, f.cnpj as nf_cnpj,
                            c.natureza_servico
                        FROM transacoes_bancarias t
                        JOIN comprovantes c ON t.id = c.transacao_id
                        JOIN fornecedores f ON c.fornecedor_id = f.id
                    `;
                    db.all(ownershipSql, [], (err, ownershipRows) => {
                        if (ownershipRows) {
                            report.titularidade = ownershipRows.filter(row => {
                                if (row.tx_doc && row.nf_cnpj) {
                                    const cleanTxDoc = row.tx_doc.replace(/\D/g, '');
                                    const cleanNfDoc = row.nf_cnpj.replace(/\D/g, '');
                                    if (cleanTxDoc && cleanNfDoc) return cleanTxDoc !== cleanNfDoc;
                                }
                                if (!row.tx_favorecido || !row.nf_emissor) return false;
                                const fav = row.tx_favorecido.toLowerCase().trim();
                                const emissor = row.nf_emissor.toLowerCase().trim();
                                const firstWordEmissor = emissor.split(' ')[0].toLowerCase();
                                return !fav.includes(firstWordEmissor);
                            });
                        }

                        // 5. Antecipação de Receita
                        db.all(`SELECT valor FROM boletos_emitidos WHERE status = 'pago'`, [], (err, boletos) => {
                            const total = boletos.reduce((acc, b) => acc + b.valor, 0);
                            const expectedNet = total * 0.975;
                            db.get(`SELECT SUM(valor) as total FROM transacoes_bancarias WHERE tipo = 'CREDIT' AND (descricao LIKE '%REPASSE%' OR descricao LIKE '%BOLETO%')`, (err, repasse) => {
                                const actualRepasse = repasse?.total || 0;
                                const diff = Math.abs(expectedNet - actualRepasse);
                                if (diff > 10) {
                                    report.receita_antecipada.push({ expected: expectedNet, actual: actualRepasse, divergence: diff });
                                }
                                res.json(report);
                            });
                        });
                    });
                });
            });
        });
    });
});

// 18. Fila de Reconciliação (Comprovantes não vinculados)
app.get('/api/reconciliation/queue', (req, res) => {
    const sql = `
        SELECT 
            c.id, 
            c.valor, 
            c.data_emissao as data, 
            f.razao_social as unidade, 
            c.status,
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

// 20. Buscar Matches Sugeridos para um Comprovante
app.get('/api/reconciliation/matches/:receiptId', (req, res) => {
    const receiptId = req.params.receiptId;

    db.get(`SELECT c.*, f.razao_social FROM comprovantes c JOIN fornecedores f ON c.fornecedor_id = f.id WHERE c.id = ?`, [receiptId], (err, receipt) => {
        if (err || !receipt) return res.status(404).json({ error: 'Comprovante não encontrado' });

        // Buscar transações de débito próximas em valor e data
        const sql = `
            SELECT 
                id, 
                valor, 
                data_transacao as data, 
                descricao
            FROM transacoes_bancarias 
            WHERE tipo = 'DEBIT' AND conciliado = 0
            ORDER BY ABS(data_transacao - ?) ASC
            LIMIT 20
        `;

        db.all(sql, [receipt.data_emissao], (err, txs) => {
            if (err) return res.status(500).json({ error: err.message });

            // Lógica de Scoring simples
            const matches = txs.map(tx => {
                let score = 0;
                let reasons = [];

                // 1. Valor Exato
                if (Math.abs(tx.valor) === receipt.valor) {
                    score += 70;
                    reasons.push('Valor Exato');
                } else if (Math.abs(Math.abs(tx.valor) - receipt.valor) < 1) {
                    score += 40;
                    reasons.push('Valor Aproximado');
                }

                // 2. Data Próxima (Janela de 10 dias)
                const txDate = new Date(tx.data);
                const rcDate = new Date(receipt.data_emissao);
                const diffTime = Math.abs(txDate.getTime() - rcDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays <= 2) {
                    score += 20;
                    reasons.push('Data Próxima');
                } else if (diffDays <= 7) {
                    score += 10;
                    reasons.push('Mesma Semana');
                }

                // 3. Descrição / Fornecedor
                if (tx.descricao.toLowerCase().includes(receipt.razao_social.toLowerCase().split(' ')[0])) {
                    score += 10;
                    reasons.push('Nome Compatível');
                }

                return {
                    ...tx,
                    matchScore: Math.min(score, 100),
                    matchReasons: reasons
                };
            }).filter(m => m.matchScore > 20) // Filtra lixo
                .sort((a, b) => b.matchScore - a.matchScore);

            res.json({ matches });
        });
    });
});

// 18. Vincular Comprovante a Transação
app.post('/api/reconciliation/link', (req, res) => {
    const { transacao_id, comprovante_id } = req.body;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // 1. Atualizar o comprovante com o ID da transação
        db.run(`UPDATE comprovantes SET transacao_id = ?, status = 'auditado' WHERE id = ?`,
            [transacao_id, comprovante_id], (err) => {

                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Erro ao vincular nota fiscal' });
                }

                // 2. Marcar a transação como conciliada
                db.run(`UPDATE transacoes_bancarias SET conciliado = 1 WHERE id = ?`, [transacao_id], (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Erro ao atualizar transação' });
                    }

                    db.run('COMMIT');
                    res.json({ success: true });
                });
            });
    });
});

// 19. Checagem de Titularidade (Auditores Master)
app.get('/api/audit/ownership-report', (req, res) => {
    const sql = `
        SELECT 
            t.id as transacao_id,
            t.descricao as tx_desc,
            t.favorecido as tx_favorecido,
            t.valor as tx_valor,
            f.razao_social as nf_emissor,
            c.id as nf_id
        FROM transacoes_bancarias t
        JOIN comprovantes c ON t.id = c.transacao_id
        JOIN fornecedores f ON c.fornecedor_id = f.id
        WHERE t.favorecido IS NOT NULL
    `;

    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // Lógica de comparação (Fuzzy simplificado ou exato)
        const divergences = rows.filter(row => {
            if (!row.tx_favorecido || !row.nf_emissor) return false;
            const fav = row.tx_favorecido.toLowerCase().trim();
            const emissor = row.nf_emissor.toLowerCase().trim();
            // Verifica se um nome está contido no outro (básico)
            return !fav.includes(emissor) && !emissor.includes(fav);
        });

        res.json({ ownership_divergences: divergences });
    });
});

// 21. Exportar Laudo Final
app.get('/api/audit/export/laudo', (req, res) => {
    const data = {
        condominio: "AUDI HOME - CONDOMÍNIO EXEMPLO",
        periodo: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        findings: []
    };

    db.serialize(() => {
        // 1. Despesas sem NF
        db.all(`SELECT descricao, valor FROM transacoes_bancarias WHERE tipo = 'DEBIT' AND conciliado = 0`, (err, rows) => {
            if (rows?.length > 0) {
                data.findings.push(`❌ DESPESAS SEM COMPROVANTE: ${rows.length} itens (Total: R$ ${rows.reduce((acc, r) => acc + Math.abs(r.valor), 0).toFixed(2)})`);
            }

            // 2. Divergências RFB
            db.all(`SELECT audit_report FROM transacoes_bancarias WHERE audit_status != 'pendente' AND audit_status != 'ok'`, (err, rows) => {
                if (rows?.length > 0) {
                    data.findings.push(`⚠️ ALERTAS RFB/CNAE: ${rows.length} fornecedores com irregularidade cadastral detectada.`);
                }

                // 3. Orçamento
                db.get(`SELECT SUM(valor_planejado) as p FROM orcamento_anual`, (err, row) => {
                    const planejado = row?.p || 0;
                    db.get(`SELECT SUM(ABS(valor)) as r FROM transacoes_bancarias WHERE tipo = 'DEBIT'`, (err, row) => {
                        const real = row?.r || 0;
                        if (real > planejado) {
                            data.findings.push(`🚨 DÉFICIT ORÇAMENTÁRIO: Gasto real (R$ ${real.toFixed(2)}) superou o planejado (R$ ${planejado.toFixed(2)})`);
                        }

                        // Formatação final do texto
                        let reportText = `LAUDO DE AUDITORIA E COMPLIANCE - ${data.condominio}\n`;
                        reportText += `Competência: ${data.periodo}\n`;
                        reportText += `==========================================\n\n`;

                        if (data.findings.length === 0) {
                            reportText += "✅ NENHUMA IRREGULARIDADE ENCONTRADA NO PERÍODO.\n";
                        } else {
                            reportText += "DIVERGÊNCIAS DETECTADAS:\n";
                            data.findings.forEach(f => reportText += `- ${f}\n`);
                        }

                        reportText += `\nGerado automaticamente pelo Sistema Audi Home em ${new Date().toLocaleString('pt-BR')}\n`;

                        res.setHeader('Content-Type', 'text/plain');
                        res.send(reportText);
                    });
                });
            });
        });
    });
});
// 22. Buscar Matches para MÚLTIPLOS Comprovantes (Lote de Pagamento)
app.post('/api/reconciliation/matches/multi', (req, res) => {
    const { receiptIds } = req.body;
    if (!receiptIds || receiptIds.length === 0) return res.status(400).json({ error: 'Nenhum ID enviado' });

    const placeholders = receiptIds.map(() => '?').join(',');
    const sqlReceipts = `
        SELECT c.*, f.razao_social 
        FROM comprovantes c 
        JOIN fornecedores f ON c.fornecedor_id = f.id 
        WHERE c.id IN (${placeholders})
    `;

    db.all(sqlReceipts, receiptIds, (err, receipts) => {
        if (err || (receipts && receipts.length === 0)) return res.status(404).json({ error: 'Comprovantes não encontrados' });

        const totalValor = receipts.reduce((acc, r) => acc + r.valor, 0);
        const dataReferencia = receipts[0].data_emissao; // Usa a primeira como referência

        // Buscar transações de débito próximas em valor TOTAL e data
        const sqlTx = `
            SELECT 
                id, 
                valor, 
                data_transacao as data, 
                descricao
            FROM transacoes_bancarias 
            WHERE tipo = 'DEBIT' AND conciliado = 0
            ORDER BY ABS(ABS(valor) - ?) ASC
            LIMIT 20
        `;

        db.all(sqlTx, [totalValor], (err, txs) => {
            if (err) return res.status(500).json({ error: err.message });

            const matches = txs.map(tx => {
                let score = 0;
                let reasons = [];

                if (Math.abs(Math.abs(tx.valor) - totalValor) < 0.05) {
                    score += 80;
                    reasons.push('Valor Total Exato');
                } else if (Math.abs(Math.abs(tx.valor) - totalValor) < 1) {
                    score += 50;
                    reasons.push('Valor Total Aproximado');
                }

                const txDate = new Date(tx.data);
                const rcDate = new Date(dataReferencia);
                const diffDays = Math.ceil(Math.abs(txDate.getTime() - rcDate.getTime()) / (1000 * 60 * 60 * 24));

                if (diffDays <= 3) {
                    score += 20;
                    reasons.push('Data Compatível');
                }

                return {
                    ...tx,
                    matchScore: Math.min(score, 100),
                    matchReasons: reasons
                };
            }).filter(m => m.matchScore > 20)
                .sort((a, b) => b.matchScore - a.matchScore);

            res.json({ matches, totalCalculado: totalValor });
        });
    });
});

// 18. Vincular Múltiplos Comprovantes a UMA Transação
app.post('/api/reconciliation/link-multi', (req, res) => {
    const { transacao_id, comprovante_ids } = req.body;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const stmt = db.prepare('UPDATE comprovantes SET transacao_id = ?, status = "auditado" WHERE id = ?');

        comprovante_ids.forEach(id => {
            stmt.run(transacao_id, id);
        });

        stmt.finalize(() => {
            db.run('UPDATE transacoes_bancarias SET conciliado = 1 WHERE id = ?', [transacao_id], (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Erro ao vincular' });
                }
                db.run('COMMIT');
                res.json({ success: true });
            });
        });
    });
});


// 19. Fundo de Reserva - Auditoria Mensal
app.get('/api/reserva/audit/:year/:month', (req, res) => {
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

app.listen(PORT, () => {
    console.log(`🚀 Servidor Local rodando em http://localhost:${PORT}`);
});
