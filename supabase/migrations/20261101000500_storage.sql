-- Migration 6 (database-access-layer.md §2): exercise-images bucket
-- Mirrors docs/specs/supabase-schema.sql; the schema parity check (scripts/check-schema-parity.ts) proves it.

-- -----------------------------------------------------------------------------
-- 10. Storage: public bucket for exercise images (reference data only)
-- -----------------------------------------------------------------------------
-- Objects live at exercise-images/<exercise_id>/<n>.jpg (§7.6 step 5).
-- Reads: the bucket is public, so browsers load images through the public URL
--   https://<project-ref>.supabase.co/storage/v1/object/public/exercise-images/...
--   which needs no storage.objects policy.
-- Writes: only scripts/upload-exercise-images.ts with SUPABASE_SECRET_KEY
--   (service_role bypasses RLS). No insert/update/delete policy is created for
--   anon or authenticated, so RLS on storage.objects denies every client write.
-- User photos are NEVER stored anywhere (D-01).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-images', 'exercise-images', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

