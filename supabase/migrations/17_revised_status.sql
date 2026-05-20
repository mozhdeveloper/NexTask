-- 17_revised_status.sql
-- Removes "late" from the submission flow; adds "revised" (employee re-uploaded
-- after an approved revision) and "resubmitted" to revision_status (marks that
-- the employee acted on the approved revision request).
--
-- IMPORTANT: PostgreSQL does not allow a newly added enum value to be used
-- in the same transaction it was added in ("unsafe use of new value").
-- Run STEP 1, STEP 2, and STEP 3 as THREE SEPARATE executions in the
-- Supabase SQL Editor.

-- ── STEP 1: Add new enum values ──────────────────────────────────────────────
ALTER TYPE public.submission_status ADD VALUE IF NOT EXISTS 'revised';
ALTER TYPE public.revision_status   ADD VALUE IF NOT EXISTS 'resubmitted';

-- ── STEP 2: Migrate legacy 'late' submissions → 'submitted' ─────────────────
-- Run this in a NEW query AFTER Step 1 completes.
-- UPDATE public.submissions
-- SET status = 'submitted'
-- WHERE status = 'late';

-- ── STEP 3: (Optional) Verify no remaining 'late' rows ──────────────────────
-- SELECT COUNT(*) FROM public.submissions WHERE status = 'late';
--
-- Note: removing enum values in PostgreSQL requires recreating the type,
-- which is risky on a live database. The 'late' value is kept in the enum
-- for DB-level compatibility but is no longer assigned by the application.
