-- ============================================================
-- AUDITCONDO v1.4 — Multi-documento: Pix, Boleto, NF, Recibo
-- ============================================================

ALTER TABLE public.comprovantes
    ADD COLUMN IF NOT EXISTS tipo_documento      TEXT DEFAULT 'DESCONHECIDO',
    ADD COLUMN IF NOT EXISTS pix_e2e_id          TEXT,          -- Número de Controle Pix (E2E ID)
    ADD COLUMN IF NOT EXISTS pix_pagador_doc     TEXT,          -- CPF/CNPJ mascarado de quem pagou
    ADD COLUMN IF NOT EXISTS pix_pagador_banco   TEXT,          -- Banco de quem pagou
    ADD COLUMN IF NOT EXISTS pix_recebedor_doc   TEXT,          -- CPF/CNPJ/Chave de quem recebeu
    ADD COLUMN IF NOT EXISTS pix_recebedor_banco TEXT,          -- Banco de quem recebeu
    ADD COLUMN IF NOT EXISTS pix_chave           TEXT,          -- Chave Pix do recebedor
    ADD COLUMN IF NOT EXISTS pix_autotransferencia BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS e2e_id_valido       BOOLEAN,       -- NULL=não é Pix, true/false = validado
    ADD COLUMN IF NOT EXISTS e2e_banco_compativel BOOLEAN,      -- ISPB do E2E bate com banco declarado
    ADD COLUMN IF NOT EXISTS e2e_data_compativel BOOLEAN;       -- data dentro do E2E bate com data do doc

-- Índice para busca por E2E ID (detecta comprovante duplicado real)
CREATE INDEX IF NOT EXISTS idx_comprovantes_pix_e2e ON public.comprovantes(pix_e2e_id)
    WHERE pix_e2e_id IS NOT NULL;
