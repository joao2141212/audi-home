-- Tabela para armazenar as conexões bancárias dos condomínios
CREATE TABLE IF NOT EXISTS condominio_contas_bancarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condominio_id VARCHAR(255) NOT NULL,
    pluggy_item_id VARCHAR(255) NOT NULL,
    pluggy_account_id VARCHAR(255) NOT NULL,
    banco_nome VARCHAR(255),
    conta_numero VARCHAR(100),
    saldo_atual DECIMAL(15, 2),
    conectado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ultima_sincronizacao TIMESTAMP WITH TIME ZONE,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(condominio_id)
);

-- Índices para performance
CREATE INDEX idx_condominio_contas_condominio ON condominio_contas_bancarias(condominio_id);
CREATE INDEX idx_condominio_contas_pluggy_account ON condominio_contas_bancarias(pluggy_account_id);

-- Comentários
COMMENT ON TABLE condominio_contas_bancarias IS 'Armazena as conexões Open Finance (Pluggy) das contas bancárias dos condomínios';
COMMENT ON COLUMN condominio_contas_bancarias.pluggy_item_id IS 'ID do Item retornado pela Pluggy (representa a conexão)';
COMMENT ON COLUMN condominio_contas_bancarias.pluggy_account_id IS 'ID da Account na Pluggy (a conta bancária específica)';
