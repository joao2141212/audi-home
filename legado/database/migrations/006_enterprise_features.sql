-- Tabela de Log de Auditoria Imutável
CREATE TABLE IF NOT EXISTS audit_log_immutable (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL, -- 'expense', 'receipt', 'reconciliation'
    entity_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'APPROVE', 'REJECT', 'FLAG_FRAUD'
    actor_id VARCHAR(255) NOT NULL, -- User ID or 'SYSTEM'
    previous_state JSONB,
    new_state JSONB,
    metadata JSONB,
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    client_ip VARCHAR(45),
    user_agent TEXT
);

-- Revogar permissões de update/delete para garantir imutabilidade (simulado, pois depende do role)
-- REVOKE UPDATE, DELETE ON audit_log_immutable FROM authenticated, anon, service_role;

-- Tabela de Fila de Jobs (Async Processing)
CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(50) NOT NULL, -- 'batch_audit_expense', 'ocr_processing'
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
    attempts INT DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    locked_at TIMESTAMP WITH TIME ZONE -- Para evitar race condition entre workers
);

-- Índice para buscar jobs pendentes rapidamente
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status, created_at);
