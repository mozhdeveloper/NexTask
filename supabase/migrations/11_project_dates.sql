-- Add start_date and completed_at to projects table
alter table public.projects
  add column if not exists start_date date,
  add column if not exists completed_at date;
