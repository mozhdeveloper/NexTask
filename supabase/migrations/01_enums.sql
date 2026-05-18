-- 01_enums.sql
-- Idempotent: wrap each enum in a DO block.

do $$ begin
  create type public.user_role as enum ('admin','manager','employee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.submission_status as enum (
    'pending','submitted','late','missing',
    'revision_requested','revision_approved','revision_rejected','locked'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.revision_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.project_status as enum ('planning','in_progress','review','completed','on_hold');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.backup_status as enum ('running','completed','failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_type as enum ('info','success','warning','danger');
exception when duplicate_object then null; end $$;
