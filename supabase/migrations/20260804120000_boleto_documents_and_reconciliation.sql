-- Documento do boleto e vínculo explícito com o crédito bancário.
-- O OFX continua sendo a origem do lançamento; o arquivo fica no Storage.

ALTER TABLE public.boletos_emitidos
  ADD COLUMN IF NOT EXISTS beneficiario TEXT,
  ADD COLUMN IF NOT EXISTS linha_digitavel TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_url TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_nome TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_tipo TEXT;

CREATE INDEX IF NOT EXISTS idx_boletos_emitidos_transacao
  ON public.boletos_emitidos(transacao_id)
  WHERE transacao_id IS NOT NULL;

DROP POLICY IF EXISTS "boletos_emitidos_condo_isolation" ON public.boletos_emitidos;
CREATE POLICY "boletos_emitidos_condo_isolation"
  ON public.boletos_emitidos FOR ALL
  USING ((SELECT public.user_has_condo_access(condominio_id)))
  WITH CHECK ((SELECT public.user_has_condo_access(condominio_id)));

GRANT SELECT, INSERT, UPDATE ON public.boletos_emitidos TO authenticated;
