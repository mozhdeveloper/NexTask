-- 08_rls_policies.sql
-- ⚠️ PHASE 2 — DO NOT RUN until you are ready to lock down access.
-- Until this file is run, the anon key has full table access.
--
-- This file enables Row Level Security on every public table and defines
-- per-role policies that mirror the application's permission model.
--
-- Role detection: we read `public.users.role` for the row whose
-- `auth_user_id = auth.uid()`. A SECURITY DEFINER helper avoids RLS recursion.

----------------------------------------------------------------
-- Helper: current_app_user_id() and current_app_role()
----------------------------------------------------------------
create or replace function public.current_app_user_id()
returns text language sql stable security definer set search_path = public as $$
  select id from public.users where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.current_app_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.users where auth_user_id = auth.uid() limit 1;
$$;

revoke all on function public.current_app_user_id()  from public;
revoke all on function public.current_app_role()     from public;
grant execute on function public.current_app_user_id() to authenticated, anon;
grant execute on function public.current_app_role()    to authenticated, anon;

----------------------------------------------------------------
-- Enable RLS on every public table
----------------------------------------------------------------
alter table public.departments       enable row level security;
alter table public.users             enable row level security;
alter table public.submission_types  enable row level security;
alter table public.submissions       enable row level security;
alter table public.attachments       enable row level security;
alter table public.revisions         enable row level security;
alter table public.activity_logs     enable row level security;
alter table public.backup_logs       enable row level security;
alter table public.projects          enable row level security;
alter table public.notifications     enable row level security;
alter table public.work_settings     enable row level security;
alter table public.holidays          enable row level security;

----------------------------------------------------------------
-- Departments — readable by all authenticated, mutable by admin
----------------------------------------------------------------
drop policy if exists "departments_read_all"      on public.departments;
drop policy if exists "departments_admin_write"   on public.departments;
create policy "departments_read_all"    on public.departments for select to authenticated using (true);
create policy "departments_admin_write" on public.departments for all    to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');

----------------------------------------------------------------
-- Users — everyone sees the directory; only admin mutates
----------------------------------------------------------------
drop policy if exists "users_read_all"     on public.users;
drop policy if exists "users_self_update"  on public.users;
drop policy if exists "users_admin_write"  on public.users;
create policy "users_read_all"    on public.users for select to authenticated using (true);
create policy "users_self_update" on public.users for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy "users_admin_write" on public.users for all    to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');

----------------------------------------------------------------
-- Submission types — readable by all, admin writes
----------------------------------------------------------------
drop policy if exists "stypes_read"        on public.submission_types;
drop policy if exists "stypes_admin_write" on public.submission_types;
create policy "stypes_read"        on public.submission_types for select to authenticated using (true);
create policy "stypes_admin_write" on public.submission_types for all    to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');

----------------------------------------------------------------
-- Submissions — employee CRUD own; manager reads dept; admin all
----------------------------------------------------------------
drop policy if exists "sub_read_own_or_priv"  on public.submissions;
drop policy if exists "sub_insert_self"       on public.submissions;
drop policy if exists "sub_update_self_unlk"  on public.submissions;
drop policy if exists "sub_admin_write"       on public.submissions;

create policy "sub_read_own_or_priv" on public.submissions for select to authenticated using (
  user_id = public.current_app_user_id()
  or public.current_app_role() = 'admin'
  or (public.current_app_role() = 'manager'
      and exists (
        select 1 from public.users u1
        join   public.users u2 on u2.department_id = u1.department_id
        where  u1.auth_user_id = auth.uid()
          and  u2.id = public.submissions.user_id
      ))
);
create policy "sub_insert_self" on public.submissions for insert to authenticated with check (
  user_id = public.current_app_user_id()
);
create policy "sub_update_self_unlk" on public.submissions for update to authenticated
  using (user_id = public.current_app_user_id() and locked = false)
  with check (user_id = public.current_app_user_id());
create policy "sub_admin_write" on public.submissions for all to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

----------------------------------------------------------------
-- Attachments — follow submission visibility
----------------------------------------------------------------
drop policy if exists "att_read"        on public.attachments;
drop policy if exists "att_owner_write" on public.attachments;
drop policy if exists "att_admin_write" on public.attachments;
create policy "att_read" on public.attachments for select to authenticated using (
  exists (select 1 from public.submissions s where s.id = attachments.submission_id
          and (s.user_id = public.current_app_user_id() or public.current_app_role() in ('admin','manager')))
);
create policy "att_owner_write" on public.attachments for insert to authenticated with check (
  exists (select 1 from public.submissions s where s.id = attachments.submission_id and s.user_id = public.current_app_user_id())
);
create policy "att_admin_write" on public.attachments for all to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

----------------------------------------------------------------
-- Revisions — owner reads/inserts; admin decides
----------------------------------------------------------------
drop policy if exists "rev_read"          on public.revisions;
drop policy if exists "rev_owner_insert"  on public.revisions;
drop policy if exists "rev_admin_write"   on public.revisions;
create policy "rev_read" on public.revisions for select to authenticated using (
  user_id = public.current_app_user_id() or public.current_app_role() in ('admin','manager')
);
create policy "rev_owner_insert" on public.revisions for insert to authenticated with check (
  user_id = public.current_app_user_id()
);
create policy "rev_admin_write" on public.revisions for all to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

----------------------------------------------------------------
-- Activity logs — owner reads own, admin reads all; everyone inserts own
----------------------------------------------------------------
drop policy if exists "log_read"        on public.activity_logs;
drop policy if exists "log_insert_self" on public.activity_logs;
create policy "log_read" on public.activity_logs for select to authenticated using (
  user_id = public.current_app_user_id() or public.current_app_role() = 'admin'
);
create policy "log_insert_self" on public.activity_logs for insert to authenticated with check (
  user_id is null or user_id = public.current_app_user_id()
);

----------------------------------------------------------------
-- Backup logs — admin only
----------------------------------------------------------------
drop policy if exists "bk_admin_all" on public.backup_logs;
create policy "bk_admin_all" on public.backup_logs for all to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

----------------------------------------------------------------
-- Projects — everyone reads, admin/manager write
----------------------------------------------------------------
drop policy if exists "proj_read"   on public.projects;
drop policy if exists "proj_write"  on public.projects;
create policy "proj_read"  on public.projects for select to authenticated using (true);
create policy "proj_write" on public.projects for all    to authenticated
  using (public.current_app_role() in ('admin','manager'))
  with check (public.current_app_role() in ('admin','manager'));

----------------------------------------------------------------
-- Notifications — only own; admin can write/read all
----------------------------------------------------------------
drop policy if exists "notif_self"        on public.notifications;
drop policy if exists "notif_admin_all"   on public.notifications;
create policy "notif_self"      on public.notifications for all to authenticated
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());
create policy "notif_admin_all" on public.notifications for all to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

----------------------------------------------------------------
-- Work settings + holidays — read all, admin writes
----------------------------------------------------------------
drop policy if exists "ws_read"        on public.work_settings;
drop policy if exists "ws_admin_write" on public.work_settings;
create policy "ws_read"        on public.work_settings for select to authenticated using (true);
create policy "ws_admin_write" on public.work_settings for all    to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

drop policy if exists "holi_read"        on public.holidays;
drop policy if exists "holi_admin_write" on public.holidays;
create policy "holi_read"        on public.holidays for select to authenticated using (true);
create policy "holi_admin_write" on public.holidays for all    to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

----------------------------------------------------------------
-- Storage policies for the `submissions` bucket
----------------------------------------------------------------
-- Convention used by the app: object key is "{userId}/{date}/{filename}"
-- so the first path segment must equal the uploader's public.users.id.

drop policy if exists "submissions_storage_read"   on storage.objects;
drop policy if exists "submissions_storage_insert" on storage.objects;
drop policy if exists "submissions_storage_delete" on storage.objects;

create policy "submissions_storage_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'submissions' and (
      public.current_app_role() in ('admin','manager')
      or (storage.foldername(name))[1] = public.current_app_user_id()
    )
  );

create policy "submissions_storage_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = public.current_app_user_id()
  );

create policy "submissions_storage_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'submissions' and (
      public.current_app_role() = 'admin'
      or (storage.foldername(name))[1] = public.current_app_user_id()
    )
  );
