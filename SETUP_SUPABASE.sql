-- =====================================================
-- SCRIPT DE SETUP COMPLETO PARA SUPABASE
-- Execute este SQL no Supabase SQL Editor
-- =====================================================

-- 1. Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABELA: condominio_contas_bancarias (Conexões Open Finance)
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

-- 3. TABELA: extratos_bancarios
CREATE TABLE IF NOT EXISTS extratos_bancarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    arquivo_nome VARCHAR(255) NOT NULL,
    arquivo_url TEXT,
    arquivo_hash VARCHAR(64) UNIQUE NOT NULL,
    data_importacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    periodo_inicio DATE,
    periodo_fim DATE,
    fonte VARCHAR(50) CHECK (fonte IN ('manual', 'open_finance')) DEFAULT 'manual',
    criado_por UUID,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. TABELA: transacoes_bancarias
CREATE TABLE IF NOT EXISTS transacoes_bancarias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    extrato_id UUID REFERENCES extratos_bancarios(id) ON DELETE CASCADE,
    data_transacao DATE NOT NULL,
    valor DECIMAL(15,2) NOT NULL,
    tipo VARCHAR(20) CHECK (tipo IN ('credito', 'debito')) NOT NULL,
    descricao TEXT,
    nsu VARCHAR(50),
    codigo_barras VARCHAR(100),
    conta_origem VARCHAR(50),
    conta_destino VARCHAR(50),
    status_reconciliacao VARCHAR(20) CHECK (status_reconciliacao IN ('pendente', 'reconciliado', 'divergente', 'ignorado')) DEFAULT 'pendente',
    comprovante_id UUID,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_transaction UNIQUE (extrato_id, nsu, data_transacao, valor)
);

-- 5. TABELA: comprovantes
CREATE TABLE IF NOT EXISTS comprovantes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    arquivo_nome VARCHAR(255) NOT NULL,
    arquivo_url TEXT NOT NULL,
    arquivo_hash VARCHAR(64) NOT NULL,
    tipo_arquivo VARCHAR(20) CHECK (tipo_arquivo IN ('pdf', 'jpg', 'jpeg', 'png')) NOT NULL,
    tamanho_bytes BIGINT,
    
    enviado_por UUID,
    unidade VARCHAR(20),
    data_envio TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    ocr_processado BOOLEAN DEFAULT FALSE,
    ocr_confianca DECIMAL(5,2),
    ocr_valor DECIMAL(15,2),
    ocr_data DATE,
    ocr_nsu VARCHAR(50),
    ocr_codigo_barras VARCHAR(100),
    ocr_texto_completo TEXT,
    ocr_erro TEXT,
    
    fraud_score DECIMAL(5,2) DEFAULT 0,
    fraud_flags JSONB,
    documento_alterado BOOLEAN DEFAULT FALSE,
    duplicado_de UUID REFERENCES comprovantes(id),
    
    status VARCHAR(30) CHECK (status IN ('pendente', 'processando', 'aprovado', 'rejeitado', 'suspeito', 'duplicado')) DEFAULT 'pendente',
    transacao_id UUID REFERENCES transacoes_bancarias(id),
    
    revisado_por UUID,
    data_revisao TIMESTAMP WITH TIME ZONE,
    motivo_decisao TEXT,
    
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. TABELA: fila_reconciliacao
CREATE TABLE IF NOT EXISTS fila_reconciliacao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comprovante_id UUID REFERENCES comprovantes(id) ON DELETE CASCADE,
    prioridade INT DEFAULT 0,
    tipo VARCHAR(30) CHECK (tipo IN ('manual', 'excecao', 'duplicado', 'fraude_suspeita', 'multiplos_matches', 'baixa_confianca')) DEFAULT 'manual',
    matches_sugeridos JSONB,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atribuido_a UUID,
    status VARCHAR(20) CHECK (status IN ('pendente', 'em_revisao', 'concluido', 'cancelado')) DEFAULT 'pendente',
    concluido_em TIMESTAMP WITH TIME ZONE
);

-- 7. TABELA: orcamento
CREATE TABLE IF NOT EXISTS orcamento (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ano INT NOT NULL,
    categoria VARCHAR(100) NOT NULL,
    subcategoria VARCHAR(100),
    valor_programado DECIMAL(15,2) NOT NULL,
    data_aprovacao DATE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    auditado_por UUID
);

-- 8. TABELA: pagamentos
CREATE TABLE IF NOT EXISTS pagamentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    data_pagamento DATE NOT NULL,
    cnpj_fornecedor VARCHAR(18),
    razao_social VARCHAR(200),
    nf_numero VARCHAR(20),
    nf_serie VARCHAR(5),
    valor DECIMAL(15,2) NOT NULL,
    tipo_pagamento VARCHAR(20) CHECK (tipo_pagamento IN ('boleto', 'cheque', 'pix', 'tef', 'debito_automatico')),
    
    status_validacao VARCHAR(20) CHECK (status_validacao IN ('ok', 'divergencia', 'erro', 'pendente')) DEFAULT 'pendente',
    status_rfb VARCHAR(20),
    cnae_nf VARCHAR(10),
    cnae_consulta VARCHAR(10),
    motivo_divergencia TEXT,
    
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. TABELA: audit_log
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tabela VARCHAR(50) NOT NULL,
    id_registro UUID NOT NULL,
    usuario_id UUID,
    acao VARCHAR(20) NOT NULL,
    dados_anterior JSONB,
    dados_novo JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- 10. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_transacoes_data ON transacoes_bancarias(data_transacao);
CREATE INDEX IF NOT EXISTS idx_transacoes_valor ON transacoes_bancarias(valor);
CREATE INDEX IF NOT EXISTS idx_transacoes_status ON transacoes_bancarias(status_reconciliacao);
CREATE INDEX IF NOT EXISTS idx_transacoes_nsu ON transacoes_bancarias(nsu) WHERE nsu IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comprovantes_status ON comprovantes(status);
CREATE INDEX IF NOT EXISTS idx_comprovantes_hash ON comprovantes(arquivo_hash);
CREATE INDEX IF NOT EXISTS idx_comprovantes_ocr_data ON comprovantes(ocr_data) WHERE ocr_data IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fila_status ON fila_reconciliacao(status);
CREATE INDEX IF NOT EXISTS idx_condominio_contas_condominio ON condominio_contas_bancarias(condominio_id);
CREATE INDEX IF NOT EXISTS idx_condominio_contas_pluggy_account ON condominio_contas_bancarias(pluggy_account_id);

-- Comentários
COMMENT ON TABLE condominio_contas_bancarias IS 'Armazena as conexões Open Finance (Pluggy) das contas bancárias dos condomínios';
COMMENT ON TABLE extratos_bancarios IS 'Extratos bancários importados manualmente ou via Open Finance';
COMMENT ON TABLE transacoes_bancarias IS 'Transações extraídas dos extratos bancários';
COMMENT ON TABLE comprovantes IS 'Comprovantes de pagamento enviados pelos moradores';
COMMENT ON TABLE fila_reconciliacao IS 'Fila de itens pendentes para reconciliação manual';

-- =====================================================
-- FIM DO SCRIPT
-- =====================================================
