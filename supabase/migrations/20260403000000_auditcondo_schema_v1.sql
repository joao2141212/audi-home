-- ============================================================
-- AUDITCONDO - Schema v1.0 (Production Foundation)
-- Stack: Supabase (Postgres + Auth + Storage + Edge Functions)
-- Multi-tenant: Row Level Security enforced at DB level
-- Scope: Antifraude para condomínios via OCR + CNPJ validation
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy name matching (CNPJ validação nome)

-- ============================================================
-- TENANT HIERARCHY
-- Administradora → Condomínio → Perfil (User)
-- ============================================================

-- 1. ADMINISTRADORAS (optional grouping, for future scale)
CREATE TABLE IF NOT EXISTS public.administradoras (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome        TEXT NOT NULL,
    cnpj        TEXT UNIQUE,
    ativo       BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CONDOMINIOS (The core tenant unit)
CREATE TABLE IF NOT EXISTS public.condominios (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    administradora_id   UUID REFERENCES public.administradoras(id) ON DELETE SET NULL,
    nome                TEXT NOT NULL,
    cnpj                TEXT UNIQUE,
    endereco            TEXT,
    ativo               BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PERFIS (Extends Supabase auth.users - created automatically on sign-up)
CREATE TABLE IF NOT EXISTS public.perfis (
    id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome                TEXT,
    email               TEXT,
    role                TEXT NOT NULL DEFAULT 'sindico'
                            CHECK (role IN ('master', 'gestor', 'sindico')),
    administradora_id   UUID REFERENCES public.administradoras(id),
    condominio_id       UUID REFERENCES public.condominios(id),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create perfil on Supabase Auth sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.perfis (id, email, role)
    VALUES (NEW.id, NEW.email, 'sindico');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ANTIFRAUDE CORE: FORNECEDORES (CNPJ Cache / Whitelist)
-- ============================================================

-- 4. FORNECEDORES (Global CNPJ cache, shared across tenants, no PII)
CREATE TABLE IF NOT EXISTS public.fornecedores (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cnpj                    TEXT UNIQUE NOT NULL,
    razao_social            TEXT,
    nome_fantasia           TEXT,
    situacao_cadastral      TEXT,           -- 'ATIVA', 'BAIXADA', 'SUSPENSA', etc.
    cnae_principal_codigo   TEXT,           -- e.g. '4329-1/01'
    cnae_principal_descricao TEXT,          -- e.g. 'Manutenção de Elevadores'
    cnaes_secundarios       JSONB,          -- Array of {codigo, descricao}
    rfb_ultima_consulta     TIMESTAMPTZ,    -- When we last hit the RFB API
    rfb_raw_response        JSONB,          -- Full API response cached
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast CNPJ lookup (the most common query in the system)
CREATE INDEX IF NOT EXISTS idx_fornecedores_cnpj ON public.fornecedores(cnpj);

-- ============================================================
-- FINANCIAL DATA (All multi-tenant via condominio_id)
-- ============================================================

-- 5. EXTRATOS BANCÁRIOS (uploaded or via Open Finance future)
CREATE TABLE IF NOT EXISTS public.extratos_bancarios (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    condominio_id   UUID NOT NULL REFERENCES public.condominios(id) ON DELETE CASCADE,
    arquivo_nome    TEXT,
    arquivo_url     TEXT,                   -- Supabase Storage URL
    arquivo_hash    TEXT,                   -- SHA-256, prevents re-import same file
    periodo_inicio  DATE,
    periodo_fim     DATE,
    instituicao     TEXT,                   -- 'Itau', 'Bradesco', etc.
    total_creditos  NUMERIC(15,2) DEFAULT 0,
    total_debitos   NUMERIC(15,2) DEFAULT 0,
    fonte           TEXT DEFAULT 'manual'
                        CHECK (fonte IN ('manual', 'open_finance')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extratos_condominio ON public.extratos_bancarios(condominio_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_extratos_hash ON public.extratos_bancarios(condominio_id, arquivo_hash)
    WHERE arquivo_hash IS NOT NULL;

-- 6. TRANSAÇÕES BANCÁRIAS (rows from statement)
CREATE TABLE IF NOT EXISTS public.transacoes_bancarias (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    condominio_id           UUID NOT NULL REFERENCES public.condominios(id) ON DELETE CASCADE,
    extrato_id              UUID REFERENCES public.extratos_bancarios(id) ON DELETE CASCADE,
    data_transacao          DATE NOT NULL,
    descricao               TEXT,
    valor                   NUMERIC(15,2) NOT NULL,
    type                    TEXT NOT NULL CHECK (type IN ('CREDIT', 'DEBIT')),
    nsu                     TEXT,           -- Bank's unique transaction ID
    codigo_barras           TEXT,           -- Barcode if boleto payment
    conciliado              BOOLEAN DEFAULT FALSE,
    comprovante_id          UUID,           -- Set after reconciliation (FK added below)
    created_at              TIMESTAMPTZ DEFAULT NOW(),

    -- Prevents importing duplicate transactions from same statement
    CONSTRAINT uq_transacao UNIQUE (extrato_id, nsu, data_transacao, valor)
);

CREATE INDEX IF NOT EXISTS idx_transacoes_condominio ON public.transacoes_bancarias(condominio_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_data ON public.transacoes_bancarias(data_transacao);
CREATE INDEX IF NOT EXISTS idx_transacoes_valor ON public.transacoes_bancarias(valor);
CREATE INDEX IF NOT EXISTS idx_transacoes_conciliado ON public.transacoes_bancarias(conciliado) WHERE NOT conciliado;

-- 7. COMPROVANTES (Boletos, NFs, recibos — the core of the product)
CREATE TABLE IF NOT EXISTS public.comprovantes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    condominio_id       UUID NOT NULL REFERENCES public.condominios(id) ON DELETE CASCADE,
    fornecedor_id       UUID REFERENCES public.fornecedores(id),

    -- Upload metadata
    arquivo_nome        TEXT,
    arquivo_url         TEXT,               -- Supabase Storage URL
    arquivo_hash        TEXT NOT NULL,      -- SHA-256 for duplicate detection (Layer 1 fraud)
    tipo_arquivo        TEXT CHECK (tipo_arquivo IN ('pdf', 'jpg', 'jpeg', 'png', 'xml')),
    tamanho_bytes       BIGINT,

    -- OCR Extraction Results (via Gemini Edge Function)
    ocr_processado      BOOLEAN DEFAULT FALSE,
    ocr_confianca       NUMERIC(5,2),       -- 0-100
    ocr_valor           NUMERIC(15,2),
    ocr_data            DATE,
    ocr_nsu             TEXT,
    ocr_codigo_barras   TEXT,
    ocr_cnpj            TEXT,               -- CNPJ extracted from document
    ocr_razao_social    TEXT,               -- Name extracted from document
    ocr_texto_completo  TEXT,
    ocr_erro            TEXT,

    -- CNPJ Validation Results
    cnpj_status         TEXT,               -- 'ATIVA', 'BAIXADA', 'NAO_ENCONTRADO'
    cnpj_nome_sim       NUMERIC(5,2),       -- Name similarity score 0-100 vs RFB
    cnpj_cnae_compat    BOOLEAN,            -- CNAE compatible with natureza_servico?
    cnpj_validado_em    TIMESTAMPTZ,

    -- Fraud Detection (Multi-layer)
    fraud_score         NUMERIC(5,2) DEFAULT 0, -- 0-100
    fraud_flags         JSONB DEFAULT '[]',      -- Array of detected issues
    duplicado_de        UUID REFERENCES public.comprovantes(id),

    -- Reconciliation
    status              TEXT DEFAULT 'pendente'
                            CHECK (status IN (
                                'pendente',
                                'processando',
                                'aprovado',
                                'rejeitado',
                                'suspeito',
                                'duplicado'
                            )),
    transacao_id        UUID REFERENCES public.transacoes_bancarias(id),
    natureza_servico    TEXT,               -- What service was this payment for (for CNAE check)

    -- Manual Review Trail
    revisado_por        UUID REFERENCES auth.users(id),
    data_revisao        TIMESTAMPTZ,
    motivo_decisao      TEXT,

    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comprovantes_condominio ON public.comprovantes(condominio_id);
CREATE INDEX IF NOT EXISTS idx_comprovantes_hash ON public.comprovantes(arquivo_hash);
CREATE INDEX IF NOT EXISTS idx_comprovantes_status ON public.comprovantes(status);
CREATE INDEX IF NOT EXISTS idx_comprovantes_cnpj ON public.comprovantes(ocr_cnpj);
CREATE INDEX IF NOT EXISTS idx_comprovantes_fraud ON public.comprovantes(fraud_score) WHERE fraud_score > 0;

-- Add FK from transacoes back to comprovantes (circular, so after both created)
ALTER TABLE public.transacoes_bancarias
    ADD CONSTRAINT fk_transacao_comprovante
    FOREIGN KEY (comprovante_id) REFERENCES public.comprovantes(id) ON DELETE SET NULL;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — The Multi-Tenancy Guarantee
-- ============================================================

ALTER TABLE public.administradoras      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condominios          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extratos_bancarios   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transacoes_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comprovantes         ENABLE ROW LEVEL SECURITY;

-- Helper: Get current user's profile (avoids subquery repetition)
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.perfis
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT * FROM public.perfis WHERE id = auth.uid();
$$;

-- PERFIS: User can only see and update their own profile
CREATE POLICY "perfis_own" ON public.perfis
    FOR ALL USING (id = auth.uid());

-- ADMINISTRADORAS: Masters see all; gestors see their own
CREATE POLICY "admin_master_all" ON public.administradoras
    FOR ALL USING ((get_my_profile()).role = 'master');

CREATE POLICY "admin_gestor_own" ON public.administradoras
    FOR SELECT USING (
        id = (get_my_profile()).administradora_id
    );

-- CONDOMINIOS: Role-scoped access
CREATE POLICY "condo_master_all" ON public.condominios
    FOR ALL USING ((get_my_profile()).role = 'master');

CREATE POLICY "condo_gestor_own_admin" ON public.condominios
    FOR SELECT USING (
        administradora_id = (get_my_profile()).administradora_id
    );

CREATE POLICY "condo_sindico_own" ON public.condominios
    FOR SELECT USING (
        id = (get_my_profile()).condominio_id
    );

-- FORNECEDORES: Readable by all authenticated users (global CNPJ cache, no PII)
CREATE POLICY "fornecedores_read_all" ON public.fornecedores
    FOR SELECT USING (auth.role() = 'authenticated');

-- Edge functions (service_role) can write to fornecedores
CREATE POLICY "fornecedores_service_write" ON public.fornecedores
    FOR ALL USING (auth.role() = 'service_role');

-- Financial data: user can only access their condominio's data
-- Reusable function for tenant check
CREATE OR REPLACE FUNCTION public.user_has_condo_access(condo_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.perfis p
        WHERE p.id = auth.uid()
        AND (
            p.role = 'master'
            OR p.condominio_id = condo_id
            OR EXISTS (
                SELECT 1 FROM public.condominios c
                WHERE c.id = condo_id
                AND c.administradora_id = p.administradora_id
            )
        )
    );
$$;

CREATE POLICY "extratos_tenant" ON public.extratos_bancarios
    FOR ALL USING (public.user_has_condo_access(condominio_id));

CREATE POLICY "transacoes_tenant" ON public.transacoes_bancarias
    FOR ALL USING (public.user_has_condo_access(condominio_id));

CREATE POLICY "comprovantes_tenant" ON public.comprovantes
    FOR ALL USING (public.user_has_condo_access(condominio_id));

-- ============================================================
-- SEED: 5 Pilot Condominios
-- ============================================================

INSERT INTO public.condominios (nome, cnpj) VALUES
    ('Condomínio Piloto 1 - Residencial Paulista',  '00.000.001/0001-01'),
    ('Condomínio Piloto 2 - Edifício Central',       '00.000.002/0001-02'),
    ('Condomínio Piloto 3 - Torres do Sol',          '00.000.003/0001-03'),
    ('Condomínio Piloto 4 - Villa Verde',            '00.000.004/0001-04'),
    ('Condomínio Piloto 5 - Parque das Flores',      '00.000.005/0001-05')
ON CONFLICT (cnpj) DO NOTHING;
