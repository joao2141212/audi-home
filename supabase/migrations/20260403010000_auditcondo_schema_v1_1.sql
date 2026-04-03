-- ============================================================
-- AUDITCONDO - Schema v1.1 (Missing Tables + Bug Fixes)
-- ============================================================

-- ============================================================
-- MISSING TABLES
-- ============================================================

-- Orçamento Anual (Budget Manager)
CREATE TABLE IF NOT EXISTS public.orcamento_anual (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condominio_id   UUID NOT NULL REFERENCES public.condominios(id) ON DELETE CASCADE,
    categoria       TEXT NOT NULL,
    valor_previsto  NUMERIC(15,2) NOT NULL DEFAULT 0,
    ano             INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (condominio_id, categoria, ano)
);

CREATE INDEX IF NOT EXISTS idx_orcamento_condominio ON public.orcamento_anual(condominio_id);

ALTER TABLE public.orcamento_anual ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orcamento_tenant" ON public.orcamento_anual
    FOR ALL USING (public.user_has_condo_access(condominio_id));

-- Reserva Config (Reserve Fund config per condo)
CREATE TABLE IF NOT EXISTS public.reserva_config (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condominio_id               UUID NOT NULL UNIQUE REFERENCES public.condominios(id) ON DELETE CASCADE,
    saldo_inicial               NUMERIC(15,2) DEFAULT 0,
    valor_mensal_programado     NUMERIC(15,2) DEFAULT 0,
    percentual_arrecadacao      NUMERIC(5,2) DEFAULT 5.0,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reserva_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reserva_config_tenant" ON public.reserva_config
    FOR ALL USING (public.user_has_condo_access(condominio_id));

-- Reserva Movimentações (Reserve Fund transactions)
CREATE TABLE IF NOT EXISTS public.reserva_movimentacoes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condominio_id       UUID NOT NULL REFERENCES public.condominios(id) ON DELETE CASCADE,
    tipo                TEXT NOT NULL CHECK (tipo IN ('DEPOSITO', 'SAQUE', 'RENDIMENTO')),
    valor               NUMERIC(15,2) NOT NULL,
    data_movimentacao   DATE NOT NULL DEFAULT NOW(),
    descricao           TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reserva_mov_condominio ON public.reserva_movimentacoes(condominio_id);

ALTER TABLE public.reserva_movimentacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reserva_mov_tenant" ON public.reserva_movimentacoes
    FOR ALL USING (public.user_has_condo_access(condominio_id));


-- ============================================================
-- FIX: Add missing columns to comprovantes used by api.ts
-- ============================================================

ALTER TABLE public.comprovantes
    ADD COLUMN IF NOT EXISTS status_auditoria TEXT
        DEFAULT 'pendente'
        CHECK (status_auditoria IN ('pendente', 'auditado', 'suspeito', 'alerta', 'rejeitado')),
    ADD COLUMN IF NOT EXISTS data_upload TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS audit_flags TEXT,
    ADD COLUMN IF NOT EXISTS descricao TEXT,
    ADD COLUMN IF NOT EXISTS valor NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS data_emissao DATE,
    ADD COLUMN IF NOT EXISTS arquivo_nome TEXT;

-- Make arquivo_hash nullable so uploads work without client-side hashing
ALTER TABLE public.comprovantes
    ALTER COLUMN arquivo_hash DROP NOT NULL;


-- ============================================================
-- RPC: find_reconciliation_matches
-- ============================================================

CREATE OR REPLACE FUNCTION public.find_reconciliation_matches(
    p_condominio_id UUID,
    p_valor NUMERIC
)
RETURNS TABLE (
    id UUID,
    valor NUMERIC,
    data_transacao DATE,
    descricao TEXT,
    score NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        t.id,
        t.valor,
        t.data_transacao,
        t.descricao,
        GREATEST(0, 100 - ABS(t.valor - p_valor) / NULLIF(p_valor, 0) * 100) AS score
    FROM public.transacoes_bancarias t
    WHERE
        t.condominio_id = p_condominio_id
        AND t.type = 'DEBIT'
        AND t.conciliado = FALSE
        AND ABS(t.valor - p_valor) <= p_valor * 0.20
    ORDER BY score DESC, t.data_transacao DESC
    LIMIT 10;
$$;


-- ============================================================
-- VIEW: Macro financial view for Master dashboard
-- ============================================================

CREATE OR REPLACE VIEW public.view_macro_financeira AS
SELECT
    c.id AS condominio_id,
    c.nome AS condominio_nome,
    COALESCE(SUM(CASE WHEN t.type = 'CREDIT' THEN t.valor ELSE 0 END), 0) AS total_receitas,
    COALESCE(SUM(CASE WHEN t.type = 'DEBIT' THEN t.valor ELSE 0 END), 0) AS total_despesas,
    COALESCE(COUNT(comp.id) FILTER (WHERE comp.status_auditoria = 'pendente'), 0) AS comprovantes_pendentes,
    COALESCE(COUNT(comp.id) FILTER (WHERE comp.status_auditoria = 'suspeito'), 0) AS comprovantes_suspeitos
FROM public.condominios c
LEFT JOIN public.transacoes_bancarias t ON t.condominio_id = c.id
LEFT JOIN public.comprovantes comp ON comp.condominio_id = c.id
GROUP BY c.id, c.nome;
