-- ==========================================
-- AUDI HOME - ADVANCED DB FUNCTIONS & AUDIT LOGIC
-- ==========================================

-- 1. RECONCILIATION HELPER
-- Finds matches based on value tolerance and date proximity
CREATE OR REPLACE FUNCTION public.find_reconciliation_matches(
    p_condominio_id UUID,
    p_valor NUMERIC(15,2),
    p_tolerance NUMERIC DEFAULT 0.05
) 
RETURNS TABLE (
    id UUID,
    valor NUMERIC(15,2),
    data_transacao DATE,
    descricao TEXT,
    match_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id, 
        t.valor, 
        t.data_transacao, 
        t.descricao,
        CASE 
            WHEN ABS(t.valor) = ABS(p_valor) THEN 100
            ELSE 85
        END as match_score
    FROM public.transacoes_bancarias t
    WHERE t.condominio_id = p_condominio_id
      AND t.tipo = 'DEBIT'
      AND t.conciliado = FALSE
      AND ABS(ABS(t.valor) - ABS(p_valor)) < (ABS(p_valor) * p_tolerance)
    ORDER BY match_score DESC, t.data_transacao DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. MONTHLY RESERVE AUDIT
-- Aggregates deposits for a specific month vs target
CREATE OR REPLACE FUNCTION public.audit_monthly_reserve(
    p_condominio_id UUID,
    p_month DATE
)
RETURNS JSON AS $$
DECLARE
    v_target NUMERIC;
    v_realized NUMERIC;
    v_result JSON;
BEGIN
    -- Get monthly target
    SELECT valor_mensal_programado INTO v_target
    FROM public.reserva_config
    WHERE condominio_id = p_condominio_id
    LIMIT 1;

    -- Aggregate deposits
    SELECT SUM(valor) INTO v_realized
    FROM public.reserva_movimentacoes
    WHERE condominio_id = p_condominio_id
      AND tipo = 'DEPOSITO'
      AND date_trunc('month', data_movimentacao) = date_trunc('month', p_month);

    v_result := json_build_object(
        'periodo', to_char(p_month, 'MM/YYYY'),
        'meta', COALESCE(v_target, 0),
        'realizado', COALESCE(v_realized, 0),
        'diferenca', COALESCE(v_realized, 0) - COALESCE(v_target, 0),
        'status', CASE WHEN COALESCE(v_realized, 0) >= COALESCE(v_target, 0) THEN 'CONFORME' ELSE 'DIVERGENTE' END
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
