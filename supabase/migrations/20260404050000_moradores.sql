-- ============================================================
-- AUDITCONDO v1.5 — Moradores + link comprovantes a inquilinos
-- ============================================================

-- Tabela de moradores (inquilinos e proprietários do condomínio)
CREATE TABLE IF NOT EXISTS public.moradores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condominio_id   UUID NOT NULL REFERENCES public.condominios(id) ON DELETE CASCADE,

    -- Identificação
    nome            TEXT NOT NULL,
    cpf             TEXT,                   -- pode ser parcial/mascarado
    email           TEXT,
    telefone        TEXT,

    -- Localização
    unidade         TEXT NOT NULL,          -- "201", "1204", "Casa 3"
    bloco           TEXT,                   -- "A", "B", "Torre Norte" — opcional
    tipo            TEXT NOT NULL DEFAULT 'inquilino'
                        CHECK (tipo IN ('proprietario', 'inquilino', 'responsavel')),

    -- Status
    ativo           BOOLEAN NOT NULL DEFAULT TRUE,
    data_entrada    DATE,
    data_saida      DATE,

    -- Notas do síndico
    observacoes     TEXT,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_moradores_condominio ON public.moradores(condominio_id);
CREATE INDEX IF NOT EXISTS idx_moradores_unidade    ON public.moradores(condominio_id, unidade);
CREATE INDEX IF NOT EXISTS idx_moradores_cpf        ON public.moradores(cpf) WHERE cpf IS NOT NULL;

-- RLS
ALTER TABLE public.moradores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "moradores_condo_isolation" ON public.moradores
    FOR ALL USING (user_has_condo_access(condominio_id));
CREATE POLICY "moradores_insert" ON public.moradores
    FOR INSERT WITH CHECK (user_has_condo_access(condominio_id));

-- Adiciona FK de comprovantes → moradores
-- (um comprovante de Pix pode ser vinculado ao morador que pagou)
ALTER TABLE public.comprovantes
    ADD COLUMN IF NOT EXISTS morador_id UUID REFERENCES public.moradores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comprovantes_morador ON public.comprovantes(morador_id)
    WHERE morador_id IS NOT NULL;

-- View para histórico completo de comprovantes (síndico e master)
CREATE OR REPLACE VIEW public.view_historico_comprovantes AS
SELECT
    c.id,
    c.condominio_id,
    c.arquivo_nome,
    c.arquivo_url,
    c.tipo_arquivo,
    c.tipo_documento,
    c.valor,
    c.data_emissao,
    c.status_auditoria,
    c.fraud_score,
    c.fraud_flags,
    c.ocr_razao_social,
    c.ocr_cnpj,
    c.natureza_servico,
    c.descricao,
    c.pix_e2e_id,
    c.pix_pagador_doc,
    c.pix_recebedor_doc,
    c.pix_recebedor_banco,
    c.pix_chave,
    c.pix_autotransferencia,
    c.ocr_processado,
    c.ocr_confianca,
    c.motivo_rejeicao,
    c.aprovado_em,
    c.created_at,
    -- Morador vinculado (se houver)
    c.morador_id,
    m.nome          AS morador_nome,
    m.unidade       AS morador_unidade,
    m.bloco         AS morador_bloco,
    m.tipo          AS morador_tipo,
    m.cpf           AS morador_cpf,
    -- Última ação de auditoria
    (SELECT a.acao FROM public.audit_acoes a WHERE a.comprovante_id = c.id ORDER BY a.created_at DESC LIMIT 1) AS ultima_acao,
    (SELECT a.usuario_nome FROM public.audit_acoes a WHERE a.comprovante_id = c.id ORDER BY a.created_at DESC LIMIT 1) AS ultima_acao_por
FROM public.comprovantes c
LEFT JOIN public.moradores m ON m.id = c.morador_id
ORDER BY c.created_at DESC;

-- View para relatório de moradores com resumo de pagamentos
CREATE OR REPLACE VIEW public.view_moradores_resumo AS
SELECT
    m.id,
    m.condominio_id,
    m.nome,
    m.cpf,
    m.email,
    m.unidade,
    m.bloco,
    m.tipo,
    m.ativo,
    m.data_entrada,
    COUNT(c.id)                                     AS total_comprovantes,
    COUNT(c.id) FILTER (WHERE c.status_auditoria = 'auditado')  AS comprovantes_aprovados,
    COUNT(c.id) FILTER (WHERE c.status_auditoria = 'suspeito')  AS comprovantes_suspeitos,
    COUNT(c.id) FILTER (WHERE c.status_auditoria = 'rejeitado') AS comprovantes_rejeitados,
    COALESCE(SUM(c.valor) FILTER (WHERE c.status_auditoria = 'auditado'), 0) AS total_pago_aprovado,
    MAX(c.fraud_score)                              AS maior_fraud_score,
    MAX(c.created_at)                               AS ultimo_comprovante_em
FROM public.moradores m
LEFT JOIN public.comprovantes c ON c.morador_id = m.id
GROUP BY m.id, m.condominio_id, m.nome, m.cpf, m.email, m.unidade, m.bloco, m.tipo, m.ativo, m.data_entrada;
