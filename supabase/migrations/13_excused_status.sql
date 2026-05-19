-- 13_excused_status.sql
-- Adds 'excused' to the submission_status enum for holiday-excused submissions.
--
-- IMPORTANT: PostgreSQL does not allow a newly added enum value to be used
-- in the same transaction it was added in (error: "unsafe use of new value").
--
-- In Supabase SQL Editor, run STEP 1 and STEP 2 as TWO SEPARATE executions.

-- ── STEP 1: Run this first, click Run, wait for success ──────────────────
ALTER TYPE public.submission_status ADD VALUE IF NOT EXISTS 'excused';

-- ── STEP 2: Run this in a NEW query AFTER Step 1 completes ──────────────
-- (Optional) Bulk-excuse existing missing/late/pending submissions on a holiday date:
-- UPDATE submissions
-- SET status = 'excused'
-- WHERE date = 'YYYY-MM-DD'           -- replace with your holiday date
--   AND status IN ('missing', 'late', 'pending');
