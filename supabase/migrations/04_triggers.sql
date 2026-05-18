-- 04_triggers.sql

----------------------------------------------------------------
-- set_updated_at: generic updated_at touch trigger
----------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists work_settings_set_updated_at on public.work_settings;
create trigger work_settings_set_updated_at
  before update on public.work_settings
  for each row execute function public.set_updated_at();

----------------------------------------------------------------
-- trim_activity_logs: keep newest 1000 rows
----------------------------------------------------------------
create or replace function public.trim_activity_logs()
returns trigger language plpgsql as $$
begin
  delete from public.activity_logs
   where id in (
     select id from public.activity_logs
      order by created_at desc
      offset 1000
   );
  return null;
end $$;

drop trigger if exists activity_logs_trim on public.activity_logs;
create trigger activity_logs_trim
  after insert on public.activity_logs
  for each statement execute function public.trim_activity_logs();

----------------------------------------------------------------
-- auto_audit_submission_status
-- Writes to activity_logs whenever a submission status changes.
-- Acts as a DB-level safety net (catches direct SQL edits too).
----------------------------------------------------------------
create or replace function public.auto_audit_submission_status()
returns trigger language plpgsql security definer as $$
begin
  if (old.status is distinct from new.status) or (old.locked is distinct from new.locked) then
    insert into public.activity_logs (user_id, action, target_type, target_id, ip)
    values (
      new.user_id,
      'db.submission.status_changed(' || coalesce(old.status::text,'?') || '->' || new.status::text || ')',
      'submission',
      new.id,
      'db-trigger'
    );
  end if;
  return new;
end $$;

drop trigger if exists submission_status_audit on public.submissions;
create trigger submission_status_audit
  after update on public.submissions
  for each row execute function public.auto_audit_submission_status();

----------------------------------------------------------------
-- auto_audit_user_active
-- Writes to activity_logs whenever a user's is_active flag changes.
----------------------------------------------------------------
create or replace function public.auto_audit_user_active()
returns trigger language plpgsql security definer as $$
begin
  if old.is_active is distinct from new.is_active then
    insert into public.activity_logs (user_id, action, target_type, target_id, ip)
    values (
      new.id,
      case when new.is_active then 'db.user.activated' else 'db.user.deactivated' end,
      'user',
      new.id,
      'db-trigger'
    );
  end if;
  return new;
end $$;

drop trigger if exists user_active_audit on public.users;
create trigger user_active_audit
  after update on public.users
  for each row execute function public.auto_audit_user_active();

----------------------------------------------------------------
-- auto_audit_revision_decision
-- Writes to activity_logs whenever a revision is approved/rejected.
----------------------------------------------------------------
create or replace function public.auto_audit_revision_decision()
returns trigger language plpgsql security definer as $$
begin
  if old.status is distinct from new.status and new.status in ('approved','rejected') then
    insert into public.activity_logs (user_id, action, target_type, target_id, ip)
    values (
      coalesce(new.admin_id, new.user_id),
      'db.revision.' || new.status::text,
      'revision',
      new.id,
      'db-trigger'
    );
  end if;
  return new;
end $$;

drop trigger if exists revision_decision_audit on public.revisions;
create trigger revision_decision_audit
  after update on public.revisions
  for each row execute function public.auto_audit_revision_decision();

