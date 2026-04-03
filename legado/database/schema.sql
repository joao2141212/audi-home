-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table is handled by Supabase Auth, but we reference it.
-- We assume auth.users exists.

-- 1. ORÇAMENTO ANUAL
CREATE TABLE orcamento (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ano INT NOT NULL,
    categoria VARCHAR(100) NOT NULL,
    subcategoria VARCHAR(100),
    valor_programado DECIMAL(15,2) NOT NULL,
    data_aprovacao DATE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    auditado_por UUID -- References auth.users(id) in a real scenario
);

-- 2. BOLETOS EMITIDOS (Receitas)
CREATE TABLE boletos_emitidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_documento VARCHAR(50) UNIQUE NOT NULL,
    unidade VARCHAR(20),
    valor DECIMAL(15,2) NOT NULL,
    data_emissao DATE NOT NULL,
    data_vencimento DATE NOT NULL,
    status VARCHAR(20) CHECK (status IN ('aberto', 'pago', 'cancelado', 'vencido')) DEFAULT 'aberto',
    data_pagamento DATE,
    valor_pago DECIMAL(15,2),
    dias_atraso INT GENERATED ALWAYS AS (
        CASE WHEN status = 'aberto' AND CURRENT_DATE > data_vencimento THEN CURRENT_DATE - data_vencimento
             WHEN status = 'pago' AND data_pagamento > data_vencimento THEN data_pagamento - data_vencimento
             ELSE 0
        END
    ) STORED,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. PAGAMENTOS (Despesas)
CREATE TABLE pagamentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    data_pagamento DATE NOT NULL,
    cnpj_fornecedor VARCHAR(18),
    razao_social VARCHAR(200),
    nf_numero VARCHAR(20),
    nf_serie VARCHAR(5),
    valor DECIMAL(15,2) NOT NULL,
    tipo_pagamento VARCHAR(20) CHECK (tipo_pagamento IN ('boleto', 'cheque', 'pix', 'tef', 'debito_automatico')),
    
    -- Campos de Validação
    status_validacao VARCHAR(20) CHECK (status_validacao IN ('ok', 'divergencia', 'erro', 'pendente')) DEFAULT 'pendente',
    status_rfb VARCHAR(20), -- Ativo, Inativo, Suspenso
    cnae_nf VARCHAR(10),
    cnae_consulta VARCHAR(10),
    motivo_divergencia TEXT,
    
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. FUNDO DE RESERVA
CREATE TABLE fundo_reserva (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mes_referencia DATE NOT NULL, -- Primeiro dia do mês
    saldo_anterior DECIMAL(15,2) NOT NULL,
    deposito_programado DECIMAL(15,2) NOT NULL,
    deposito_realizado DECIMAL(15,2) DEFAULT 0,
    juros_aplicacao DECIMAL(15,2) DEFAULT 0,
    correcao_monetaria DECIMAL(15,2) DEFAULT 0,
    saques DECIMAL(15,2) DEFAULT 0,
    saldo_novo DECIMAL(15,2) GENERATED ALWAYS AS (saldo_anterior + deposito_realizado + juros_aplicacao + correcao_monetaria - saques) STORED,
    motivo_saque TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. AUDIT LOG
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tabela VARCHAR(50) NOT NULL,
    id_registro UUID NOT NULL,
    usuario_id UUID, -- References auth.users(id)
    acao VARCHAR(20) NOT NULL, -- INSERT, UPDATE, DELETE
    dados_anterior JSONB,
    dados_novo JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- TRIGGER FUNCTION FOR AUDIT
CREATE OR REPLACE FUNCTION audit_trigger() RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_log (tabela, id_registro, usuario_id, acao, dados_novo, timestamp)
        VALUES (TG_TABLE_NAME, NEW.id, auth.uid(), 'INSERT', row_to_json(NEW), NOW());
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_log (tabela, id_registro, usuario_id, acao, dados_anterior, dados_novo, timestamp)
        VALUES (TG_TABLE_NAME, NEW.id, auth.uid(), 'UPDATE', row_to_json(OLD), row_to_json(NEW), NOW());
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_log (tabela, id_registro, usuario_id, acao, dados_anterior, timestamp)
        VALUES (TG_TABLE_NAME, OLD.id, auth.uid(), 'DELETE', row_to_json(OLD), NOW());
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. EXTRATOS BANCÁRIOS (Bank Statements)
CREATE TABLE extratos_bancarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    arquivo_nome VARCHAR(255) NOT NULL,
    arquivo_url TEXT, -- Supabase Storage URL
    arquivo_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 for deduplication
    data_importacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    periodo_inicio DATE,
    periodo_fim DATE,
    fonte VARCHAR(50) CHECK (fonte IN ('manual', 'open_finance')) DEFAULT 'manual',
    criado_por UUID, -- References auth.users(id)
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. TRANSAÇÕES BANCÁRIAS (Bank Transactions)
CREATE TABLE transacoes_bancarias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    extrato_id UUID REFERENCES extratos_bancarios(id) ON DELETE CASCADE,
    data_transacao DATE NOT NULL,
    valor DECIMAL(15,2) NOT NULL,
    tipo VARCHAR(20) CHECK (tipo IN ('credito', 'debito')) NOT NULL,
    descricao TEXT,
    nsu VARCHAR(50), -- Unique transaction ID from bank
    codigo_barras VARCHAR(100),
    conta_origem VARCHAR(50),
    conta_destino VARCHAR(50),
    status_reconciliacao VARCHAR(20) CHECK (status_reconciliacao IN ('pendente', 'reconciliado', 'divergente', 'ignorado')) DEFAULT 'pendente',
    comprovante_id UUID, -- Link to matched receipt
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Index for faster matching queries
    CONSTRAINT unique_transaction UNIQUE (extrato_id, nsu, data_transacao, valor)
);

-- 8. COMPROVANTES (Receipts/Proofs)
CREATE TABLE comprovantes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    arquivo_nome VARCHAR(255) NOT NULL,
    arquivo_url TEXT NOT NULL, -- Supabase Storage URL
    arquivo_hash VARCHAR(64) NOT NULL, -- For duplicate detection
    tipo_arquivo VARCHAR(20) CHECK (tipo_arquivo IN ('pdf', 'jpg', 'jpeg', 'png')) NOT NULL,
    tamanho_bytes BIGINT,
    
    -- Metadata from upload
    enviado_por UUID, -- Tenant/user who uploaded
    unidade VARCHAR(20), -- Apartment/unit number
    data_envio TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- OCR Results
    ocr_processado BOOLEAN DEFAULT FALSE,
    ocr_confianca DECIMAL(5,2), -- 0-100
    ocr_valor DECIMAL(15,2),
    ocr_data DATE,
    ocr_nsu VARCHAR(50),
    ocr_codigo_barras VARCHAR(100),
    ocr_texto_completo TEXT,
    ocr_erro TEXT, -- Error message if OCR failed
    
    -- Fraud Detection
    fraud_score DECIMAL(5,2) DEFAULT 0, -- 0-100
    fraud_flags JSONB, -- Array of detected issues
    documento_alterado BOOLEAN DEFAULT FALSE,
    duplicado_de UUID REFERENCES comprovantes(id), -- If this is a duplicate
    
    -- Reconciliation Status
    status VARCHAR(30) CHECK (status IN ('pendente', 'processando', 'aprovado', 'rejeitado', 'suspeito', 'duplicado')) DEFAULT 'pendente',
    transacao_id UUID REFERENCES transacoes_bancarias(id),
    
    -- Manual Review
    revisado_por UUID, -- References auth.users(id)
    data_revisao TIMESTAMP WITH TIME ZONE,
    motivo_decisao TEXT,
    
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. FILA DE RECONCILIAÇÃO (Reconciliation Queue)
CREATE TABLE fila_reconciliacao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comprovante_id UUID REFERENCES comprovantes(id) ON DELETE CASCADE,
    prioridade INT DEFAULT 0, -- Higher = more urgent
    tipo VARCHAR(30) CHECK (tipo IN ('manual', 'excecao', 'duplicado', 'fraude_suspeita', 'multiplos_matches', 'baixa_confianca')) DEFAULT 'manual',
    matches_sugeridos JSONB, -- Array of potential transaction matches with scores
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atribuido_a UUID, -- Admin reviewing (References auth.users(id))
    status VARCHAR(20) CHECK (status IN ('pendente', 'em_revisao', 'concluido', 'cancelado')) DEFAULT 'pendente',
    concluido_em TIMESTAMP WITH TIME ZONE
);

-- INDEXES for performance
CREATE INDEX idx_transacoes_data ON transacoes_bancarias(data_transacao);
CREATE INDEX idx_transacoes_valor ON transacoes_bancarias(valor);
CREATE INDEX idx_transacoes_status ON transacoes_bancarias(status_reconciliacao);
CREATE INDEX idx_transacoes_nsu ON transacoes_bancarias(nsu) WHERE nsu IS NOT NULL;
CREATE INDEX idx_comprovantes_status ON comprovantes(status);
CREATE INDEX idx_comprovantes_hash ON comprovantes(arquivo_hash);
CREATE INDEX idx_comprovantes_ocr_data ON comprovantes(ocr_data) WHERE ocr_data IS NOT NULL;
CREATE INDEX idx_fila_status ON fila_reconciliacao(status);

-- APPLY TRIGGERS
CREATE TRIGGER audit_orcamento AFTER INSERT OR UPDATE OR DELETE ON orcamento FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_boletos AFTER INSERT OR UPDATE OR DELETE ON boletos_emitidos FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_pagamentos AFTER INSERT OR UPDATE OR DELETE ON pagamentos FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_fundo_reserva AFTER INSERT OR UPDATE OR DELETE ON fundo_reserva FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_extratos AFTER INSERT OR UPDATE OR DELETE ON extratos_bancarios FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_transacoes AFTER INSERT OR UPDATE OR DELETE ON transacoes_bancarias FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_comprovantes AFTER INSERT OR UPDATE OR DELETE ON comprovantes FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_fila AFTER INSERT OR UPDATE OR DELETE ON fila_reconciliacao FOR EACH ROW EXECUTE FUNCTION audit_trigger();
