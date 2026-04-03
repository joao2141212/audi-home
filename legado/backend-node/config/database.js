const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, '..', 'local_audi_home.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ Erro ao conectar no SQLite:', err.message);
    } else {
        console.log('📦 Conectado ao banco de dados SQLite local.');
    }
});

// Inicialização das Tabelas
function initDatabase() {
    return new Promise((resolve) => {
        db.serialize(() => {
            // Condominios
            db.run(`CREATE TABLE IF NOT EXISTS condominios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT,
                cnpj TEXT UNIQUE,
                endereco TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Users
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE,
                password_hash TEXT,
                name TEXT,
                role TEXT DEFAULT 'sindico',
                condominio_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(condominio_id) REFERENCES condominios(id)
            )`);

            // Audit Logs
            db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                condominio_id INTEGER,
                action TEXT,
                target_table TEXT,
                target_id INTEGER,
                details TEXT,
                ip_address TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Extratos
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
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Transações
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

            // Fornecedores
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

            // Comprovantes
            db.run(`CREATE TABLE IF NOT EXISTS comprovantes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                fornecedor_id INTEGER,
                data_emissao DATE,
                valor REAL,
                descricao TEXT,
                arquivo_nome TEXT,
                status TEXT DEFAULT 'pendente',
                audit_status TEXT DEFAULT 'pendente',
                audit_flags TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                transacao_id INTEGER,
                natureza_servico TEXT
            )`);

            // Orçamento
            db.run(`CREATE TABLE IF NOT EXISTS orcamento_anual (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                categoria TEXT,
                valor_planejado REAL,
                ano INTEGER,
                user_id INTEGER
            )`);

            // Boletos
            db.run(`CREATE TABLE IF NOT EXISTS boletos_emitidos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pagador TEXT,
                valor REAL,
                vencimento DATE,
                status TEXT DEFAULT 'aberto',
                data_pagamento DATE,
                user_id INTEGER
            )`);

            // Reserva Config
            db.run(`CREATE TABLE IF NOT EXISTS reserva_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                valor_mensal_programado REAL,
                saldo_inicial REAL,
                user_id INTEGER
            )`);

            // Reserva Movimentações
            db.run(`CREATE TABLE IF NOT EXISTS reserva_movimentacoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT,
                valor REAL,
                data_movimentacao DATE,
                descricao TEXT,
                user_id INTEGER
            )`);

            // File Hashes (Anti-duplicidade)
            db.run(`CREATE TABLE IF NOT EXISTS file_hashes (
                hash TEXT PRIMARY KEY,
                file_path TEXT,
                uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Seed defaults
            db.run(`INSERT OR IGNORE INTO condominios (id, nome, cnpj) VALUES (1, 'Condomínio Solar', '12.345.678/0001-90')`);

            // Seed Admin
            const adminEmail = 'admin@audi.com';
            db.get(`SELECT id FROM users WHERE email = ?`, [adminEmail], async (err, row) => {
                if (!row) {
                    const hash = await bcrypt.hash('admin', 10);
                    db.run(`INSERT INTO users (email, password_hash, name, role, condominio_id) VALUES (?, ?, ?, 'master', 1)`,
                        [adminEmail, hash, 'Gestor Master'],
                        () => console.log('👤 Admin criado: admin@audi.com / admin')
                    );
                }
                console.log('✅ Tabelas verificadas/criadas.');
                resolve();
            });
        });
    });
}

module.exports = { db, initDatabase };
