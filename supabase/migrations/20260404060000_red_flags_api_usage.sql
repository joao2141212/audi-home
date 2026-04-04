-- ============================================================
-- AUDITCONDO v1.6 — Red Flags Views + API Usage Tracker
-- Fase D: Master Anti-Fraude Avançado
-- ============================================================

-- View dos Red Flags automáticos (atualiza em tempo real)
CREATE OR REPLACE VIEW public.view_red_flags_master AS

-- Flag 1: Alto volume de suspeitos no mês
SELECT
    comp.condominio_id,
    cond.nome                                   AS condominio_nome,
    'ALTO_VOLUME_SUSPEITOS'                      AS flag_tipo,
    'critical'                                   AS severidade,
    COUNT(comp.id)                               AS valor,
    'comprovantes suspeitos nos últimos 30 dias' AS unidade,
    MAX(comp.created_at)                         AS ultimo_evento,
    NULL::TEXT                                   AS detalhe
FROM public.comprovantes comp
JOIN public.condominios cond ON cond.id = comp.condominio_id
WHERE comp.status_auditoria = 'suspeito'
  AND comp.created_at > NOW() - INTERVAL '30 days'
GROUP BY comp.condominio_id, cond.nome
HAVING COUNT(comp.id) >= 3

UNION ALL

-- Flag 2: Síndico aprovando 100% sem rejeição (possível conluio)
SELECT
    stats.condominio_id,
    stats.condominio_nome,
    'SINDICO_APROVANDO_TUDO',
    'warning',
    stats.count_aprovado,
    'aprovações sem nenhuma rejeição no mês',
    stats.ultima,
    NULL::TEXT
FROM (
    SELECT
        aa.condominio_id,
        cond.nome                                                   AS condominio_nome,
        COUNT(*) FILTER (WHERE aa.acao = 'aprovado')                AS count_aprovado,
        COUNT(*) FILTER (WHERE aa.acao = 'rejeitado')               AS count_rejeitado,
        MAX(aa.created_at)                                          AS ultima
    FROM public.audit_acoes aa
    JOIN public.condominios cond ON cond.id = aa.condominio_id
    WHERE aa.created_at > NOW() - INTERVAL '30 days'
    GROUP BY aa.condominio_id, cond.nome
) stats
WHERE stats.count_aprovado >= 5
  AND stats.count_rejeitado = 0

UNION ALL

-- Flag 3: Auto-transferência Pix detectada (crítico — fraude confirmada)
SELECT
    comp.condominio_id,
    cond.nome,
    'AUTOTRANSFERENCIA_PIX',
    'critical',
    COUNT(comp.id),
    'auto-transferências detectadas no mês',
    MAX(comp.created_at),
    NULL::TEXT
FROM public.comprovantes comp
JOIN public.condominios cond ON cond.id = comp.condominio_id
WHERE comp.pix_autotransferencia = TRUE
  AND comp.created_at > NOW() - INTERVAL '30 days'
GROUP BY comp.condominio_id, cond.nome

UNION ALL

-- Flag 4: Mesmo CNPJ suspeito em múltiplos condominios (possível cartel)
SELECT
    NULL::UUID,
    comp.ocr_cnpj,
    'FORNECEDOR_MULTI_CONDO',
    'warning',
    COUNT(DISTINCT comp.condominio_id),
    'condomínios com este CNPJ suspeito',
    MAX(comp.created_at),
    comp.ocr_razao_social
FROM public.comprovantes comp
WHERE comp.fraud_score >= 60
  AND comp.ocr_cnpj IS NOT NULL
  AND comp.ocr_cnpj != ''
GROUP BY comp.ocr_cnpj, comp.ocr_razao_social
HAVING COUNT(DISTINCT comp.condominio_id) >= 2

UNION ALL

-- Flag 5: E2E ID inválido detectado (comprovante Pix falsificado)
SELECT
    comp.condominio_id,
    cond.nome,
    'CODIGO_E2E_INVALIDO',
    'critical',
    COUNT(comp.id),
    'comprovantes Pix com código E2E inválido no mês',
    MAX(comp.created_at),
    NULL::TEXT
FROM public.comprovantes comp
JOIN public.condominios cond ON cond.id = comp.condominio_id
WHERE comp.e2e_id_valido = FALSE
  AND comp.tipo_documento = 'COMPROVANTE_PIX'
  AND comp.created_at > NOW() - INTERVAL '30 days'
GROUP BY comp.condominio_id, cond.nome;

-- ============================================================
-- View API Usage (proxy: comprovantes processados por condo)
-- ============================================================
CREATE OR REPLACE VIEW public.view_api_usage AS
SELECT
    cond.id                                             AS condominio_id,
    cond.nome                                           AS condominio_nome,
    COUNT(comp.id) FILTER (
        WHERE comp.ocr_processado = TRUE
          AND comp.created_at > NOW() - INTERVAL '1 day'
    )                                                   AS uso_hoje,
    COUNT(comp.id) FILTER (
        WHERE comp.ocr_processado = TRUE
          AND comp.created_at > NOW() - INTERVAL '7 days'
    )                                                   AS uso_semana,
    COUNT(comp.id) FILTER (
        WHERE comp.ocr_processado = TRUE
          AND comp.created_at > NOW() - INTERVAL '30 days'
    )                                                   AS uso_mes,
    -- Percentual do limite diário (500 req/dia compartilhado na conta)
    ROUND(
        COUNT(comp.id) FILTER (
            WHERE comp.ocr_processado = TRUE
              AND comp.created_at > NOW() - INTERVAL '1 day'
        )::NUMERIC / 500 * 100, 1
    )                                                   AS pct_limite_diario,
    MAX(comp.created_at) FILTER (
        WHERE comp.ocr_processado = TRUE
    )                                                   AS ultimo_uso
FROM public.condominios cond
LEFT JOIN public.comprovantes comp ON comp.condominio_id = cond.id
GROUP BY cond.id, cond.nome
ORDER BY uso_mes DESC;
