-- ============================================================
-- AUDITCONDO v1.7 — Storage privado para comprovantes
-- ============================================================

UPDATE storage.buckets
SET public = false
WHERE id = 'comprovantes';

DROP POLICY IF EXISTS "comprovantes_upload_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "comprovantes_read_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "comprovantes_delete_own" ON storage.objects;

CREATE POLICY "comprovantes_upload_condo"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'comprovantes'
        AND public.user_has_condo_access((storage.foldername(name))[1]::uuid)
    );

CREATE POLICY "comprovantes_read_condo"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'comprovantes'
        AND public.user_has_condo_access((storage.foldername(name))[1]::uuid)
    );

CREATE POLICY "comprovantes_delete_condo"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'comprovantes'
        AND public.user_has_condo_access((storage.foldername(name))[1]::uuid)
    );
