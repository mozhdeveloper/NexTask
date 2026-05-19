-- 15_work_hours_and_tasks.sql
-- Adds workspace-wide working hours (start/end) and task start tracking on submissions.

----------------------------------------------------------------
-- work_settings: working hours window
----------------------------------------------------------------
alter table public.work_settings
  add column if not exists work_start_time time not null default '09:00',
  add column if not exists work_end_time   time not null default '18:00';

----------------------------------------------------------------
-- submissions: track when the employee started the task
----------------------------------------------------------------
alter table public.submissions
  add column if not exists started_at timestamptz,
  add column if not exists task_title text;

create index if not exists submissions_started_at_idx
  on public.submissions (started_at)
  where started_at is not null;
