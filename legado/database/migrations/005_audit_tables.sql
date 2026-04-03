-- Migration 005: Tabelas de Auditoria de Despesas

-- Tabela de auditorias de despesas
CREATE TABLE IF NOT EXISTS auditorias_despesas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condominio_id VARCHAR(255) NOT NULL,
    transaction_id_pluggy VARCHAR(255) NOT NULL,
    
    -- Dados do Fornecedor
    cnpj_fornecedor VARCHAR(18) NOT NULL,
    razao_social VARCHAR(255),
    cnae_principal VARCHAR(10),
    descricao_cnae TEXT,
    status_cadastral_rfb VARCHAR(50),
    
    -- Dados do Serviço
    codigo_servico TEXT NOT NULL,
    valor_transacao DECIMAL(15, 2) NOT NULL,
    data_transacao TIMESTAMP WITH TIME ZONE,
    
    -- Resultado da Auditoria
    status_auditoria VARCHAR(20) CHECK (status_auditoria IN ('APROVADO', 'REJEITADO', 'ALERTA')) NOT NULL,
    auditado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    auditado_por UUID, -- References auth.users(id)
    
    -- Dados Completos (JSON)
    dados_completos JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de cache de fornecedores (30 dias)
CREATE TABLE IF NOT EXISTS fornecedores_auditados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cnpj VARCHAR(18) UNIQUE NOT NULL,
    razao_social VARCHAR(255),
    nome_fantasia VARCHAR(255),
    cnae_principal VARCHAR(10),
    descricao_cnae TEXT,
    status_cadastral VARCHAR(50),
    municipio VARCHAR(100),
    uf VARCHAR(2),
    
    -- Cache
    validado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expira_em TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
    
    -- Dados Completos da RFB
    dados_rfb JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_auditorias_condominio ON auditorias_despesas(condominio_id);
CREATE INDEX idx_auditorias_cnpj ON auditorias_despesas(cnpj_fornecedor);
CREATE INDEX idx_auditorias_status ON auditorias_despesas(status_auditoria);
CREATE INDEX idx_auditorias_data ON auditorias_despesas(data_transacao);

CREATE INDEX idx_fornecedores_cnpj ON fornecedores_auditados(cnpj);
CREATE INDEX idx_fornecedores_expira ON fornecedores_auditados(expira_em);

-- Comentários
COMMENT ON TABLE auditorias_despesas IS 'Registra todas as auditorias de despesas (saídas) realizadas';
COMMENT ON TABLE fornecedores_auditados IS 'Cache de fornecedores validados na RFB (30 dias de validade)';

COMMENT ON COLUMN auditorias_despesas.status_auditoria IS 'APROVADO: Tudo OK | ALERTA: CNAE incompatível ou empresa irregular | REJEITADO: CNPJ inválido';
COMMENT ON COLUMN fornecedores_auditados.expira_em IS 'Data de expiração do cache (30 dias após validação)';
