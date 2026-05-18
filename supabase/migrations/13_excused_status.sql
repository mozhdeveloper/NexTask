-- 13_excused_status.sql
-- Adds 'excused' to the submission_status enum for holiday-excused submissions.
-- Run once in Supabase SQL Editor or via: supabase db push

ALTER TYPE public.submission_status ADD VALUE IF NOT EXISTS 'excused';
