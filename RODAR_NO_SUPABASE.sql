-- 🚨 COPIE E COLE ESTE CÓDIGO NO SQL EDITOR DO SUPABASE 🚨
-- Link: https://supabase.com/dashboard/project/vkpaebpjcvbbfuohlesf/sql

-- 1. Tabela de Contas Bancárias
CREATE TABLE IF NOT EXISTS condominio_contas_bancarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condominio_id UUID NOT NULL,
    pluggy_account_id VARCHAR(255) NOT NULL,
    banco_nome VARCHAR(255),
    agencia VARCHAR(50),
    conta VARCHAR(50),
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabelas de Auditoria
CREATE TABLE IF NOT EXISTS fornecedores_auditados (
    cnpj VARCHAR(14) PRIMARY KEY,
    razao_social VARCHAR(255),
    status_receita VARCHAR(50),
    cnae_principal JSONB,
    dados_completos JSONB,
    auditado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    risco_nivel VARCHAR(20) -- 'OK', 'WARNING', 'CRITICAL'
);

CREATE TABLE IF NOT EXISTS auditorias_despesas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id_pluggy VARCHAR(255),
    condominio_id UUID,
    cnpj_fornecedor VARCHAR(14),
    valor DECIMAL(10,2),
    data_transacao DATE,
    status_auditoria VARCHAR(50), -- 'APROVADO', 'REJEITADO', 'ALERTA'
    detalhes_auditoria JSONB,
    auditado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela de Log de Auditoria Imutável (Enterprise)
CREATE TABLE IF NOT EXISTS audit_log_immutable (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    metadata JSONB,
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    client_ip VARCHAR(45),
    user_agent TEXT
);

-- 4. Tabela de Fila de Jobs (Enterprise)
CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    attempts INT DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    locked_at TIMESTAMP WITH TIME ZONE
);

-- 5. Índices de Performance
CREATE INDEX IF NOT EXISTS idx_transactions_audit_core ON condominio_contas_bancarias (condominio_id);
CREATE INDEX IF NOT EXISTS idx_auditorias_status ON auditorias_despesas (condominio_id, status_auditoria);
CREATE INDEX IF NOT EXISTS idx_audit_log_search ON audit_log_immutable (entity_type, entity_id);
