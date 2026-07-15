-- ============================================================
-- AUDITCONDO v1.8 - Winker integration foundation
-- ============================================================

CREATE TABLE IF NOT EXISTS public.winker_connections (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condominio_id           UUID NOT NULL UNIQUE REFERENCES public.condominios(id) ON DELETE CASCADE,
    id_portal               INTEGER,
    portal_name             TEXT,
    username_hint           TEXT,
    app_key_hint            TEXT,
    base_url                TEXT NOT NULL DEFAULT 'https://api.winker.com.br/v1',
    sync_interval_minutes   INTEGER NOT NULL DEFAULT 39 CHECK (sync_interval_minutes >= 15),
    status                  TEXT NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'paused', 'error')),
    last_sync_at            TIMESTAMPTZ,
    last_sync_status        TEXT,
    last_sync_error         TEXT,
    raw_me                  JSONB,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_winker_connections_portal
    ON public.winker_connections(id_portal);

CREATE TABLE IF NOT EXISTS public.winker_divisions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condominio_id       UUID NOT NULL REFERENCES public.condominios(id) ON DELETE CASCADE,
    id_portal           INTEGER NOT NULL,
    id_division         INTEGER NOT NULL,
    name                TEXT,
    description         TEXT,
    raw                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_synced_at      TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (condominio_id, id_division)
);

CREATE INDEX IF NOT EXISTS idx_winker_divisions_condo
    ON public.winker_divisions(condominio_id);

CREATE TABLE IF NOT EXISTS public.winker_units (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condominio_id       UUID NOT NULL REFERENCES public.condominios(id) ON DELETE CASCADE,
    id_portal           INTEGER NOT NULL,
    id_unit             INTEGER NOT NULL,
    id_division         INTEGER,
    division_name       TEXT,
    name                TEXT,
    administrative      BOOLEAN DEFAULT FALSE,
    generate_billing    BOOLEAN,
    raw                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_synced_at      TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (condominio_id, id_unit)
);

CREATE INDEX IF NOT EXISTS idx_winker_units_condo
    ON public.winker_units(condominio_id);

CREATE INDEX IF NOT EXISTS idx_winker_units_division
    ON public.winker_units(condominio_id, id_division);

CREATE TABLE IF NOT EXISTS public.winker_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condominio_id       UUID NOT NULL REFERENCES public.condominios(id) ON DELETE CASCADE,
    id_portal           INTEGER NOT NULL,
    id_document         TEXT NOT NULL,
    id_document_type    TEXT,
    document_type       TEXT,
    name                TEXT,
    description         TEXT,
    document_date_raw   TEXT,
    created_at_winker   TIMESTAMPTZ,
    uploaded_by         TEXT,
    uploaded_by_email   TEXT,
    file_uuid           TEXT,
    file_name           TEXT,
    file_mime_type      TEXT,
    file_size_bytes     BIGINT,
    converted_to_ia     BOOLEAN,
    is_financial        BOOLEAN NOT NULL DEFAULT FALSE,
    app_view_url        TEXT,
    app_download_url    TEXT,
    raw                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_synced_at      TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (condominio_id, id_document)
);

CREATE INDEX IF NOT EXISTS idx_winker_documents_condo
    ON public.winker_documents(condominio_id);

CREATE INDEX IF NOT EXISTS idx_winker_documents_type
    ON public.winker_documents(condominio_id, document_type);

CREATE INDEX IF NOT EXISTS idx_winker_documents_financial
    ON public.winker_documents(condominio_id, is_financial)
    WHERE is_financial = TRUE;

CREATE TABLE IF NOT EXISTS public.winker_external_records (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condominio_id       UUID NOT NULL REFERENCES public.condominios(id) ON DELETE CASCADE,
    id_portal           INTEGER NOT NULL,
    record_type         TEXT NOT NULL,
    external_id         TEXT NOT NULL,
    title               TEXT,
    raw                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_synced_at      TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (condominio_id, record_type, external_id)
);

CREATE INDEX IF NOT EXISTS idx_winker_external_records_condo
    ON public.winker_external_records(condominio_id, record_type);

CREATE TABLE IF NOT EXISTS public.winker_sync_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condominio_id       UUID REFERENCES public.condominios(id) ON DELETE CASCADE,
    id_portal           INTEGER,
    status              TEXT NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running', 'success', 'error')),
    trigger_source      TEXT NOT NULL DEFAULT 'manual'
                            CHECK (trigger_source IN ('manual', 'scheduled', 'api')),
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at         TIMESTAMPTZ,
    stats               JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message       TEXT
);

CREATE INDEX IF NOT EXISTS idx_winker_sync_runs_condo
    ON public.winker_sync_runs(condominio_id, started_at DESC);

ALTER TABLE public.winker_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winker_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winker_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winker_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winker_external_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winker_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "winker_connections_tenant_select" ON public.winker_connections
    FOR SELECT USING (public.user_has_condo_access(condominio_id));

CREATE POLICY "winker_divisions_tenant_select" ON public.winker_divisions
    FOR SELECT USING (public.user_has_condo_access(condominio_id));

CREATE POLICY "winker_units_tenant_select" ON public.winker_units
    FOR SELECT USING (public.user_has_condo_access(condominio_id));

CREATE POLICY "winker_documents_tenant_select" ON public.winker_documents
    FOR SELECT USING (public.user_has_condo_access(condominio_id));

CREATE POLICY "winker_external_records_tenant_select" ON public.winker_external_records
    FOR SELECT USING (public.user_has_condo_access(condominio_id));

CREATE POLICY "winker_sync_runs_tenant_select" ON public.winker_sync_runs
    FOR SELECT USING (
        condominio_id IS NOT NULL
        AND public.user_has_condo_access(condominio_id)
    );
