-- ============================================================
-- AUDITCONDO - Schema v1.2 (Storage Bucket + Policies)
-- ============================================================

-- Create Storage bucket for comprovantes (NF PDFs / images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'comprovantes',
    'comprovantes',
    true,                       -- public so Edge Function can fetch without auth
    10485760,                   -- 10MB max file size
    ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'application/xml', 'text/xml']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for storage: only authenticated users can upload to their own condominio folder
CREATE POLICY "comprovantes_upload_authenticated"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'comprovantes');

CREATE POLICY "comprovantes_read_authenticated"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'comprovantes');

CREATE POLICY "comprovantes_delete_own"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'comprovantes' AND auth.uid()::text = (storage.foldername(name))[1]);
