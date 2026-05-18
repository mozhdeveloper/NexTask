-- 02_tables.sql
-- All ids are text (uuid-shaped) so the existing seed IDs like "u_admin" stay valid.
-- public.users.auth_user_id links to auth.users(id) for Supabase Auth integration.

----------------------------------------------------------------
-- departments
----------------------------------------------------------------
create table if not exists public.departments (
  id          text primary key default gen_random_uuid()::text,
  name        text not null unique,
  lead        text,
  description text,
  created_at  timestamptz not null default now()
);

----------------------------------------------------------------
-- users (application-level, mirrors auth.users)
----------------------------------------------------------------
create table if not exists public.users (
  id            text primary key default gen_random_uuid()::text,
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  name          text not null,
  email         citext not null unique,
  role          public.user_role not null default 'employee',
  department_id text references public.departments(id) on delete set null,
  job_title     text,
  avatar_color  text not null default 'bg-primary',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Back-fill departments.lead FK (had to wait for users to exist)
do $$ begin
  alter table public.departments
    add constraint departments_lead_fkey foreign key (lead) references public.users(id) on delete set null;
exception when duplicate_object then null; end $$;

----------------------------------------------------------------
-- submission_types
----------------------------------------------------------------
create table if not exists public.submission_types (
  id                 text primary key default gen_random_uuid()::text,
  name               text not null,
  department_id      text references public.departments(id) on delete set null,
  required_daily     boolean not null default false,
  deadline_time      time not null default '18:00',
  allowed_file_types text[] not null default '{pdf,docx,xlsx,csv,png,jpg}',
  max_file_size_mb   integer not null default 10,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

----------------------------------------------------------------
-- submissions
----------------------------------------------------------------
create table if not exists public.submissions (
  id                    text primary key default gen_random_uuid()::text,
  user_id               text not null references public.users(id) on delete cascade,
  submission_type_id    text not null references public.submission_types(id) on delete restrict,
  date                  date not null,
  work_summary          text not null default '',
  tasks_details         text not null default '',
  status                public.submission_status not null default 'pending',
  locked                boolean not null default false,
  submitted_at          timestamptz,
  locked_at             timestamptz,
  uploaded_ip           text,
  version_number        integer not null default 1,
  parent_submission_id  text references public.submissions(id) on delete set null,
  file_path             text not null default '',
  created_at            timestamptz not null default now()
);

-- A user can only have one row per (type, date, version); resubmissions bump version_number.
do $$ begin
  alter table public.submissions
    add constraint submissions_user_type_date_version_uniq
    unique (user_id, submission_type_id, date, version_number);
exception when duplicate_object then null; end $$;

----------------------------------------------------------------
-- attachments
----------------------------------------------------------------
create table if not exists public.attachments (
  id              text primary key default gen_random_uuid()::text,
  submission_id   text not null references public.submissions(id) on delete cascade,
  original_name   text not null,
  stored_name     text not null,
  size_bytes      bigint not null default 0,
  mime            text not null default 'application/octet-stream',
  hash_stub       text not null default '',
  storage_path    text,        -- key inside the `submissions` Storage bucket; null for legacy stubs
  data_url        text,        -- legacy inline base64 for tiny seed files
  created_at      timestamptz not null default now()
);

----------------------------------------------------------------
-- revisions
----------------------------------------------------------------
create table if not exists public.revisions (
  id             text primary key default gen_random_uuid()::text,
  submission_id  text not null references public.submissions(id) on delete cascade,
  user_id        text not null references public.users(id) on delete cascade,
  reason         text not null,
  status         public.revision_status not null default 'pending',
  admin_id       text references public.users(id) on delete set null,
  admin_note     text,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz
);

----------------------------------------------------------------
-- activity_logs
----------------------------------------------------------------
create table if not exists public.activity_logs (
  id          text primary key default gen_random_uuid()::text,
  user_id     text references public.users(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

----------------------------------------------------------------
-- backup_logs
----------------------------------------------------------------
create table if not exists public.backup_logs (
  id            text primary key default gen_random_uuid()::text,
  admin_id      text references public.users(id) on delete set null,
  file_name     text not null,
  file_path     text not null,
  size_bytes    bigint not null default 0,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  status        public.backup_status not null default 'running'
);

----------------------------------------------------------------
-- projects
----------------------------------------------------------------
create table if not exists public.projects (
  id            text primary key default gen_random_uuid()::text,
  name          text not null,
  description   text,
  department_id text references public.departments(id) on delete set null,
  lead          text references public.users(id) on delete set null,
  owner_id      text references public.users(id) on delete set null,
  status        public.project_status not null default 'planning',
  members       text[] not null default '{}',
  due_date      date,
  progress      integer not null default 0 check (progress between 0 and 100),
  created_at    timestamptz not null default now()
);

----------------------------------------------------------------
-- notifications
----------------------------------------------------------------
create table if not exists public.notifications (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null references public.users(id) on delete cascade,
  type        public.notification_type not null default 'info',
  title       text not null,
  body        text not null default '',
  link        text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

----------------------------------------------------------------
-- work_settings (singleton)
----------------------------------------------------------------
create table if not exists public.work_settings (
  id                       boolean primary key default true check (id),
  working_days             integer[] not null default '{1,2,3,4,5}',
  auto_backup_enabled      boolean not null default false,
  auto_backup_email        text not null default '',
  auto_backup_time         time not null default '22:00',
  last_auto_backup_date    date,
  updated_at               timestamptz not null default now()
);

----------------------------------------------------------------
-- holidays
----------------------------------------------------------------
create table if not exists public.holidays (
  date        date primary key,
  label       text not null,
  created_at  timestamptz not null default now()
);
