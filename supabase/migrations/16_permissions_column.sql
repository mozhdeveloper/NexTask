-- 16_permissions_column.sql
-- Adds a JSONB column to work_settings that persists the admin-configurable
-- per-role permission arrays.  Empty object means "use application defaults".

ALTER TABLE public.work_settings
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
