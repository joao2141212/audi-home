-- ============================================================
-- AUDITCONDO v1.3 — Human-in-the-Loop Approval Queue
-- ============================================================

-- Tabela de ações de auditoria (audit trail imutável)
CREATE TABLE IF NOT EXISTS public.audit_acoes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comprovante_id  UUID NOT NULL REFERENCES public.comprovantes(id) ON DELETE CASCADE,
    condominio_id   UUID NOT NULL REFERENCES public.condominios(id),
    usuario_id      UUID NOT NULL REFERENCES auth.users(id),
    usuario_nome    TEXT,
    acao            TEXT NOT NULL CHECK (acao IN ('aprovado', 'rejeitado', 'solicitado_esclarecimento', 'escalado_master')),
    motivo          TEXT,                          -- obrigatório para rejeição
    fraud_score_na_acao INTEGER,                   -- snapshot do score no momento da ação
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_audit_acoes_comprovante ON public.audit_acoes(comprovante_id);
CREATE INDEX IF NOT EXISTS idx_audit_acoes_condominio  ON public.audit_acoes(condominio_id);
CREATE INDEX IF NOT EXISTS idx_audit_acoes_created     ON public.audit_acoes(created_at DESC);

-- RLS
ALTER TABLE public.audit_acoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_acoes_condo_isolation" ON public.audit_acoes
    FOR ALL USING (user_has_condo_access(condominio_id));

CREATE POLICY "audit_acoes_insert" ON public.audit_acoes
    FOR INSERT WITH CHECK (user_has_condo_access(condominio_id));

-- Atualiza comprovantes: adiciona colunas de aprovação se não existirem
ALTER TABLE public.comprovantes
    ADD COLUMN IF NOT EXISTS motivo_rejeicao   TEXT,
    ADD COLUMN IF NOT EXISTS aprovado_por      UUID REFERENCES auth.users(id),
    ADD COLUMN IF NOT EXISTS aprovado_em       TIMESTAMPTZ;

-- View para fila de revisão (itens que precisam de ação humana)
CREATE OR REPLACE VIEW public.view_fila_revisao AS
SELECT
    c.id,
    c.condominio_id,
    c.arquivo_nome,
    c.valor,
    c.data_emissao,
    c.status_auditoria,
    c.fraud_score,
    c.fraud_flags,
    c.ocr_razao_social,
    c.ocr_cnpj,
    c.cnpj_status,
    c.natureza_servico,
    c.descricao,
    c.created_at,
    c.motivo_rejeicao,
    -- última ação tomada
    (SELECT a.acao FROM public.audit_acoes a WHERE a.comprovante_id = c.id ORDER BY a.created_at DESC LIMIT 1) AS ultima_acao,
    (SELECT a.created_at FROM public.audit_acoes a WHERE a.comprovante_id = c.id ORDER BY a.created_at DESC LIMIT 1) AS ultima_acao_em
FROM public.comprovantes c
WHERE c.status_auditoria IN ('suspeito', 'alerta', 'pendente')
ORDER BY c.fraud_score DESC NULLS LAST, c.created_at DESC;
