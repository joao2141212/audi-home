-- Otimização de Performance para Escala (10k Condomínios)
-- Índices compostos para consultas frequentes de auditoria

-- Índice para busca rápida de transações por data e valor (Core da auditoria)
CREATE INDEX IF NOT EXISTS idx_transactions_audit_core 
ON transacoes_bancarias (data_transacao, valor, pluggy_account_id);

-- Índice para busca de auditorias por condomínio e status
CREATE INDEX IF NOT EXISTS idx_auditorias_status 
ON auditorias_despesas (condominio_id, status_auditoria, auditado_em);

-- Índice para busca de fornecedores auditados (Cache)
CREATE INDEX IF NOT EXISTS idx_fornecedores_cache 
ON fornecedores_auditados (cnpj, auditado_em);

-- Índice para Audit Log (Busca por entidade e ator)
CREATE INDEX IF NOT EXISTS idx_audit_log_search 
ON audit_log_immutable (entity_type, entity_id, actor_id);

-- Comentários de Performance
COMMENT ON INDEX idx_transactions_audit_core IS 'Otimiza busca de match de transações (Data + Valor)';
COMMENT ON INDEX idx_auditorias_status IS 'Otimiza dashboard de pendências por condomínio';
