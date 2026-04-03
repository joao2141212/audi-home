const express = require('express');
const crypto = require('crypto');
const { db } = require('../config/database');

const router = express.Router();

// Função para lookup na Brasil API
async function lookupBrasilAPI(cnpj) {
    const cleanCnpj = cnpj.replace(/\D/g, '');
    try {
        console.log(`📡 [RFB] Consultando CNPJ: ${cleanCnpj}`);
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, {
            headers: { 'User-Agent': 'AudiHomeBot/1.0' }
        });
        if (!response.ok) return { error: `Status ${response.status}` };
        return await response.json();
    } catch (err) {
        console.error('❌ [RFB] Erro:', err.message);
        return { error: err.message };
    }
}

// CNAE Map para validação de compatibilidade
const CNAE_MAP = {
    'TI': ['62', '63'],
    'LIMPEZA': ['81', '38'],
    'MANUTENCAO': ['43', '33'],
    'ADMINISTRATIVO': ['82', '69', '70'],
    'OBRA': ['41', '42', '43'],
    'ELEVADORES': ['43', '33', '28'],
    'ENERGIA': ['35'],
    'SEGURO': ['65'],
    'PREVIDENCIA': ['84']
};

function isCnaeCompatible(natureza, cnaeFull) {
    if (!natureza || !cnaeFull) return true;
    const cat = natureza.toUpperCase();
    const allowedPrefixes = CNAE_MAP[cat];
    if (!allowedPrefixes) return true; // Categoria desconhecida = ignora
    return allowedPrefixes.includes(String(cnaeFull).substring(0, 2));
}

// POST /api/receipts/validate-cnpj - Validação RFB + CNAE antes de salvar
router.post('/validate-cnpj', async (req, res) => {
    const { cnpj, natureza_servico } = req.body;

    if (!cnpj) {
        return res.json({ valid: false, error: 'CNPJ não informado' });
    }

    const rfbData = await lookupBrasilAPI(cnpj);

    if (rfbData.error) {
        return res.json({
            valid: false,
            warning: true,
            message: `⚠️ Não foi possível consultar RFB: ${rfbData.error}. Prossiga com cautela.`
        });
    }

    const situacao = rfbData.descricao_situacao_cadastral || rfbData.situacao_cadastral;
    const isActive = ['ATIVA', 'Ativa'].includes(situacao);
    const cnae = rfbData.cnae_fiscal || rfbData.cnae_fiscal_principal;
    const cnaeCompatible = isCnaeCompatible(natureza_servico, cnae);

    console.log(`🔍 [RFB] ${rfbData.razao_social}: Situação=${situacao}, CNAE=${cnae}, Natureza=${natureza_servico}`);

    if (!isActive) {
        return res.json({
            valid: false,
            block: true,
            situacao: situacao,
            razao_social: rfbData.razao_social,
            message: `🚫 BLOQUEADO: CNPJ ${situacao} na Receita Federal. Empresa: ${rfbData.razao_social}`
        });
    }

    if (!cnaeCompatible) {
        return res.json({
            valid: false,
            warning: true,
            situacao: situacao,
            cnae: cnae,
            razao_social: rfbData.razao_social,
            message: `⚠️ ATENÇÃO: CNAE (${cnae}) incompatível com o serviço "${natureza_servico}". Empresa: ${rfbData.razao_social}`
        });
    }

    return res.json({
        valid: true,
        situacao: situacao,
        cnae: cnae,
        razao_social: rfbData.razao_social,
        message: `✅ CNPJ válido e ativo: ${rfbData.razao_social}`
    });
});

// POST /api/receipts/validate - Pré-validação de duplicidade
router.post('/validate', (req, res) => {
    const { cnpj, data_emissao, valor, file_content_base64 } = req.body;

    if (file_content_base64) {
        const fileHash = crypto.createHash('sha256').update(file_content_base64).digest('hex');
        db.get('SELECT hash FROM file_hashes WHERE hash = ?', [fileHash], (err, row) => {
            if (row) {
                return res.json({
                    isDuplicate: true,
                    reason: 'HASH_EXISTENTE',
                    message: 'ESTE ARQUIVO JÁ FOI ENVIADO ANTERIORMENTE.'
                });
            }
            checkBusinessLogic();
        });
    } else {
        checkBusinessLogic();
    }

    function checkBusinessLogic() {
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

// POST /api/receipts/save - Salvar comprovante
router.post('/save', (req, res) => {
    const { cnpj, razao_social, data_emissao, valor, descricao, natureza_servico, arquivo_nome, user_id, file_content_base64, audit_status, audit_flags } = req.body;

    // Hash check
    if (file_content_base64) {
        const fileHash = crypto.createHash('sha256').update(file_content_base64).digest('hex');
        db.get('SELECT hash FROM file_hashes WHERE hash = ?', [fileHash], (err, row) => {
            if (row) {
                return res.status(409).json({ error: 'DUPLICIDADE: Este arquivo exato já foi enviado anteriormente.' });
            }
            db.run('INSERT INTO file_hashes (hash, file_path) VALUES (?, ?)', [fileHash, arquivo_nome]);
        });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        const checkDupeQuery = `
            SELECT c.id FROM comprovantes c 
            JOIN fornecedores f ON c.fornecedor_id = f.id 
            WHERE f.cnpj = ? AND c.data_emissao = ? AND c.valor = ? AND c.status != 'rejeitado'
        `;

        db.get(checkDupeQuery, [cnpj, data_emissao, valor], (err, row) => {
            if (row) {
                db.run('ROLLBACK');
                return res.status(409).json({
                    error: 'DUPLICIDADE: Já existe um comprovante com este CNPJ, Data e Valor.',
                    duplicate_id: row.id
                });
            }

            db.run(`INSERT OR IGNORE INTO fornecedores (cnpj, razao_social) VALUES (?, ?)`,
                [cnpj, razao_social],
                async function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Erro ao salvar fornecedor' });
                    }

                    db.get(`SELECT id, situacao_cadastral FROM fornecedores WHERE cnpj = ?`, [cnpj], async (err, row) => {
                        if (err || !row) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Fornecedor não encontrado' });
                        }

                        const fornecedorId = row.id;

                        // Auditoria RFB (Background)
                        if (!row.situacao_cadastral) {
                            const rfbData = await lookupBrasilAPI(cnpj);
                            if (rfbData && !rfbData.error) {
                                db.run(`UPDATE fornecedores SET razao_social = ?, situacao_cadastral = ?, cnae_principal = ? WHERE id = ?`,
                                    [rfbData.razao_social, rfbData.descricao_situacao_cadastral, rfbData.cnae_fiscal, fornecedorId]
                                );
                            }
                        }

                        // Determina status final
                        const finalStatus = audit_status === 'alerta' ? 'alerta' : 'pendente';

                        db.run(`INSERT INTO comprovantes (user_id, fornecedor_id, data_emissao, valor, descricao, natureza_servico, arquivo_nome, status, audit_flags)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [user_id || 1, fornecedorId, data_emissao, valor, descricao, natureza_servico, arquivo_nome, finalStatus, audit_flags || null],
                            function (err) {
                                if (err) {
                                    console.error('Erro ao salvar comprovante:', err);
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: 'Erro ao salvar comprovante' });
                                }
                                db.run('COMMIT');
                                console.log(`📄 Comprovante salvo: ID=${this.lastID}, Status=${finalStatus}, Flags=${audit_flags || 'nenhuma'}`);
                                res.json({ success: true, id: this.lastID, status: finalStatus, flags: audit_flags });
                            }
                        );
                    });
                }
            );
        });
    });
});

// GET /api/receipts - Listar comprovantes
router.get('/', (req, res) => {
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

module.exports = router;
