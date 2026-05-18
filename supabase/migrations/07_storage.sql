-- 07_storage.sql
-- Creates the private `submissions` bucket. Run once.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submissions',
  'submissions',
  false,
  10 * 1024 * 1024,  -- 10MB cap (matches submission_types.max_file_size_mb default)
  null               -- accept any mime; app validates against submission_types.allowed_file_types
)
on conflict (id) do nothing;
