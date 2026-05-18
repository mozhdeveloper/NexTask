-- 05_views_rpcs.sql

----------------------------------------------------------------
-- View: submission joined with user + department + type
----------------------------------------------------------------
create or replace view public.view_submission_with_user as
  select
    s.*,
    u.name           as user_name,
    u.email          as user_email,
    u.department_id  as user_department_id,
    d.name           as department_name,
    t.name           as type_name,
    t.deadline_time  as type_deadline_time
  from public.submissions s
  left join public.users u            on u.id = s.user_id
  left join public.departments d      on d.id = u.department_id
  left join public.submission_types t on t.id = s.submission_type_id;

----------------------------------------------------------------
-- rpc_count_working_days(from, to) — inclusive
----------------------------------------------------------------
create or replace function public.rpc_count_working_days(p_from date, p_to date)
returns integer language plpgsql stable as $$
declare
  v_days integer[] := '{1,2,3,4,5}';
  v_count integer := 0;
  v_cur date := p_from;
begin
  select working_days into v_days from public.work_settings limit 1;
  if v_days is null then v_days := '{1,2,3,4,5}'; end if;

  while v_cur <= p_to loop
    -- Postgres dow: 0=Sun..6=Sat (matches app's convention)
    if extract(dow from v_cur)::int = any (v_days)
       and not exists (select 1 from public.holidays h where h.date = v_cur) then
      v_count := v_count + 1;
    end if;
    v_cur := v_cur + 1;
  end loop;

  return v_count;
end $$;

----------------------------------------------------------------
-- rpc_unread_notification_count(user_id)
----------------------------------------------------------------
create or replace function public.rpc_unread_notification_count(p_user_id text)
returns integer language sql stable as $$
  select count(*)::int from public.notifications
   where user_id = p_user_id and read = false;
$$;

----------------------------------------------------------------
-- rpc_today_stats(user_id) → jsonb
----------------------------------------------------------------
create or replace function public.rpc_today_stats(p_user_id text)
returns jsonb language plpgsql stable as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_week_start date := v_today - extract(dow from v_today)::int; -- Sunday
  v_month_start date := date_trunc('month', v_today)::date;
  v_today_row public.submissions%rowtype;
  v_week_submitted int;
  v_month_submitted int;
  v_week_expected int;
  v_month_expected int;
begin
  select * into v_today_row
    from public.submissions
   where user_id = p_user_id and date = v_today
   order by version_number desc
   limit 1;

  select count(*) into v_week_submitted
    from public.submissions
   where user_id = p_user_id
     and date between v_week_start and v_today
     and status in ('submitted','revision_approved','late');

  select count(*) into v_month_submitted
    from public.submissions
   where user_id = p_user_id
     and date between v_month_start and v_today
     and status in ('submitted','revision_approved','late');

  v_week_expected  := public.rpc_count_working_days(v_week_start, v_today);
  v_month_expected := public.rpc_count_working_days(v_month_start, v_today);

  return jsonb_build_object(
    'todayStatus', coalesce(v_today_row.status::text, 'pending'),
    'todaySubmission', case when v_today_row.id is null then null else row_to_json(v_today_row) end,
    'week',  jsonb_build_object('submitted', v_week_submitted,  'expected', v_week_expected),
    'month', jsonb_build_object('submitted', v_month_submitted, 'expected', v_month_expected)
  );
end $$;

----------------------------------------------------------------
-- rpc_department_compliance(from, to)
----------------------------------------------------------------
create or replace function public.rpc_department_compliance(p_from date, p_to date)
returns table (
  department_id   text,
  department_name text,
  submitted       integer,
  expected        integer,
  compliance_pct  numeric
)
language sql stable as $$
  with active_users as (
    select id, department_id from public.users where is_active and role <> 'admin'
  ),
  per_dept as (
    select
      d.id   as department_id,
      d.name as department_name,
      (select count(*) from active_users au where au.department_id = d.id) as user_count,
      (select count(*) from public.submissions s
        where s.date between p_from and p_to
          and s.status in ('submitted','revision_approved','late')
          and s.user_id in (select id from active_users au where au.department_id = d.id)
      ) as submitted
    from public.departments d
  )
  select
    pd.department_id,
    pd.department_name,
    pd.submitted::int,
    (pd.user_count * public.rpc_count_working_days(p_from, p_to))::int as expected,
    case
      when pd.user_count * public.rpc_count_working_days(p_from, p_to) = 0 then 0
      else round(100.0 * pd.submitted / (pd.user_count * public.rpc_count_working_days(p_from, p_to)), 1)
    end as compliance_pct
  from per_dept pd
  order by pd.department_name;
$$;

----------------------------------------------------------------
-- rpc_employee_compliance(from, to)
----------------------------------------------------------------
create or replace function public.rpc_employee_compliance(p_from date, p_to date)
returns table (
  user_id         text,
  user_name       text,
  department_name text,
  submitted       integer,
  on_time         integer,
  expected        integer,
  compliance_pct  numeric
)
language sql stable as $$
  with active_users as (
    select u.id, u.name, d.name as department_name
      from public.users u
      left join public.departments d on d.id = u.department_id
     where u.is_active and u.role <> 'admin'
  )
  select
    au.id   as user_id,
    au.name as user_name,
    au.department_name,
    (select count(*)::int from public.submissions s
      where s.user_id = au.id and s.date between p_from and p_to
        and s.status in ('submitted','revision_approved','late')) as submitted,
    (select count(*)::int from public.submissions s
      where s.user_id = au.id and s.date between p_from and p_to
        and s.status in ('submitted','revision_approved')) as on_time,
    public.rpc_count_working_days(p_from, p_to) as expected,
    case
      when public.rpc_count_working_days(p_from, p_to) = 0 then 0
      else round(
        100.0 *
        (select count(*) from public.submissions s
          where s.user_id = au.id and s.date between p_from and p_to
            and s.status in ('submitted','revision_approved'))
        / public.rpc_count_working_days(p_from, p_to),
        1)
    end as compliance_pct
  from active_users au
  order by au.name;
$$;

----------------------------------------------------------------
-- rpc_create_submission — transactional create-or-resubmit
-- Returns the submission row. Attachment inserts happen client-side after upload.
----------------------------------------------------------------
create or replace function public.rpc_create_submission(
  p_user_id            text,
  p_submission_type_id text,
  p_date               date,
  p_work_summary       text,
  p_tasks_details      text,
  p_status             public.submission_status,
  p_uploaded_ip        text,
  p_file_path          text
) returns public.submissions
language plpgsql as $$
declare
  v_existing public.submissions%rowtype;
  v_new      public.submissions%rowtype;
  v_now      timestamptz := now();
begin
  select * into v_existing
    from public.submissions
   where user_id = p_user_id
     and submission_type_id = p_submission_type_id
     and date = p_date
   order by version_number desc
   limit 1;

  if v_existing.id is not null and v_existing.locked then
    raise exception 'Submission is locked. Request a revision to edit.';
  end if;

  insert into public.submissions (
    user_id, submission_type_id, date, work_summary, tasks_details,
    status, locked, submitted_at, locked_at, uploaded_ip,
    version_number, parent_submission_id, file_path
  ) values (
    p_user_id, p_submission_type_id, p_date, coalesce(p_work_summary,''), coalesce(p_tasks_details,''),
    p_status, true, v_now, v_now, p_uploaded_ip,
    coalesce(v_existing.version_number, 0) + 1,
    v_existing.id, coalesce(p_file_path,'')
  )
  returning * into v_new;

  return v_new;
end $$;
