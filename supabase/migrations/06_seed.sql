-- 06_seed.sql
-- Idempotent demo seed (matches src/mock-data/seed.ts). Safe to re-run.
-- IDs are stable strings so the existing client code that references them keeps working.

----------------------------------------------------------------
-- DEPARTMENTS
----------------------------------------------------------------
insert into public.departments (id, name) values
  ('dept_dev','Development'),
  ('dept_design','Design'),
  ('dept_marketing','Marketing'),
  ('dept_sales','Sales'),
  ('dept_hr','HR'),
  ('dept_ops','Operations')
on conflict (id) do nothing;

----------------------------------------------------------------
-- USERS (application rows). auth_user_id is linked by 09_auth_seed.sql.
----------------------------------------------------------------
insert into public.users (id, name, email, role, department_id, job_title, avatar_color, is_active) values
  ('u_admin',        'Admin',         'admin@nexvision.local',    'admin',    'dept_ops',  'Administrator',        'bg-ink',           true),
  ('u_manager',      'Sarah Lee',     'manager@nexvision.local',  'manager',  'dept_dev',  'Engineering Manager',  'bg-violet-500',    true),
  ('u_employee',     'John Doe',      'employee@nexvision.local', 'employee', 'dept_dev',  'Senior Developer',     'bg-emerald-500',   true),
  ('u_sarah_miller', 'Sarah Miller',  'sarah.miller@nexvision.local',  'manager',  'dept_dev',       'Specialist', 'bg-teal-500',    true),
  ('u_robert_king',  'Robert King',   'robert.king@nexvision.local',   'employee', 'dept_dev',       'Associate',  'bg-amber-500',   true),
  ('u_priya_white',  'Priya White',   'priya.white@nexvision.local',   'employee', 'dept_design',    'Specialist', 'bg-rose-500',    true),
  ('u_michael_scott','Michael Scott', 'michael.scott@nexvision.local', 'employee', 'dept_marketing', 'Associate',  'bg-indigo-500',  true),
  ('u_alex_turner',  'Alex Turner',   'alex.turner@nexvision.local',   'employee', 'dept_dev',       'Specialist', 'bg-mint-500',    true),
  ('u_emily_carter', 'Emily Carter',  'emily.carter@nexvision.local',  'employee', 'dept_design',    'Associate',  'bg-peach-500',   true),
  ('u_david_kim',    'David Kim',     'david.kim@nexvision.local',     'employee', 'dept_sales',     'Specialist', 'bg-violet-500',  true),
  ('u_lisa_wong',    'Lisa Wong',     'lisa.wong@nexvision.local',     'employee', 'dept_hr',        'Associate',  'bg-emerald-500', true),
  ('u_marcus_reed',  'Marcus Reed',   'marcus.reed@nexvision.local',   'employee', 'dept_ops',       'Specialist', 'bg-teal-500',    true),
  ('u_hannah_patel', 'Hannah Patel',  'hannah.patel@nexvision.local',  'employee', 'dept_marketing', 'Associate',  'bg-amber-500',   true),
  ('u_tom_becker',   'Tom Becker',    'tom.becker@nexvision.local',    'employee', 'dept_sales',     'Specialist', 'bg-rose-500',    true),
  ('u_olivia_brown', 'Olivia Brown',  'olivia.brown@nexvision.local',  'employee', 'dept_design',    'Associate',  'bg-indigo-500',  true),
  ('u_noah_adams',   'Noah Adams',    'noah.adams@nexvision.local',    'employee', 'dept_dev',       'Specialist', 'bg-mint-500',    true),
  ('u_mia_foster',   'Mia Foster',    'mia.foster@nexvision.local',    'employee', 'dept_hr',        'Associate',  'bg-peach-500',   false)
on conflict (id) do nothing;

----------------------------------------------------------------
-- SUBMISSION TYPES
----------------------------------------------------------------
insert into public.submission_types (id, name, department_id, required_daily, deadline_time, allowed_file_types, max_file_size_mb, is_active) values
  ('st_daily',        'Daily Work Log',         null,        true,  '18:00', '{pdf,docx,xlsx,csv,png,jpg}', 10, true),
  ('st_inventory',    'Inventory Sheet',        'dept_ops',  true,  '17:00', '{xlsx,xls,csv}',              8,  true),
  ('st_design_brief', 'Design Brief',           'dept_design', false, '19:00', '{pdf,png,jpg}',             10, true),
  ('st_sales',        'Sales Pipeline Report',  'dept_sales', true, '18:30', '{xlsx,pdf,csv}',              10, true),
  ('st_weekly',       'Weekly Summary',         null,        false, '17:00', '{pdf,docx}',                  6,  true)
on conflict (id) do nothing;

----------------------------------------------------------------
-- WORK SETTINGS (singleton row)
----------------------------------------------------------------
insert into public.work_settings (id, working_days, auto_backup_enabled, auto_backup_email, auto_backup_time)
values (true, '{1,2,3,4,5}', false, '', '22:00')
on conflict (id) do nothing;

----------------------------------------------------------------
-- PROJECTS
----------------------------------------------------------------
insert into public.projects (id, name, department_id, lead, status, members, due_date) values
  ('p_dashboard',  'Client Dashboard v2',         'dept_dev',    'u_manager',     'in_progress', '{u_employee,u_sarah_miller,u_robert_king}', (current_date + 21)),
  ('p_brand',      'Brand Refresh',               'dept_design', 'u_priya_white', 'review',      '{u_priya_white,u_emily_carter,u_olivia_brown}', (current_date + 7)),
  ('p_pipeline',   'Sales Pipeline Automation',   'dept_sales',  'u_david_kim',   'planning',    '{u_david_kim,u_tom_becker}', (current_date + 40)),
  ('p_onboard',    'Onboarding Wizard',           'dept_hr',     'u_lisa_wong',   'completed',   '{u_lisa_wong,u_mia_foster}', (current_date - 7)),
  ('p_compliance', 'Compliance Audit Q2',         'dept_ops',    'u_marcus_reed', 'on_hold',     '{u_marcus_reed,u_admin}', (current_date + 50))
on conflict (id) do nothing;

----------------------------------------------------------------
-- SUBMISSIONS — 14 days x active non-admin users
-- Generated by a PL/pgSQL block so it stays declarative and idempotent.
----------------------------------------------------------------
do $$
declare
  v_user record;
  v_day  int;
  v_date date;
  v_r    int;
  v_idx  int := 0;
  v_status public.submission_status;
  v_sub_id text;
  v_submitted_at timestamptz;
  v_summary text;
  v_tasks text;
  v_summaries text[] := array[
    'Worked on client dashboard UI and fixed responsive issues.',
    'API integration and bug fixes in payment module.',
    'Database optimization and report generation.',
    'Working on landing page design.',
    'Mobile app responsive and performance fixes.',
    'Refactored auth flow and added test coverage.',
    'QA pass on the new onboarding wizard.',
    'Pipeline review and lead enrichment.',
    'Inventory reconciliation and supplier outreach.',
    'Brand guideline draft and component audit.'
  ];
  v_tasks_arr text[] := array[
    'Fixed sidebar collapse, finalized stat-card spacing, paired with QA.',
    'Closed PR #482, deployed to staging, monitoring metrics.',
    'Wrote 12 new unit tests, 3 e2e specs, all green.',
    'Reviewed 4 PRs, gave detailed feedback, merged 2.',
    'Synced with stakeholders, updated roadmap, prepared demo.'
  ];
begin
  for v_user in select id, name from public.users where role <> 'admin' and is_active order by id loop
    v_idx := v_idx + 1;
    for v_day in 0..13 loop
      v_date := current_date - v_day;
      v_r := (v_day * 7 + v_idx) % 10;

      if v_day = 0 and v_r < 3 then v_status := 'pending';
      elsif v_day = 0 and v_r = 3 then v_status := 'missing';
      elsif v_r = 4 then v_status := 'late';
      elsif v_r = 5 then v_status := 'revision_requested';
      elsif v_r = 6 then v_status := 'revision_approved';
      else v_status := 'submitted';
      end if;

      v_sub_id := 'sub_' || v_user.id || '_' || v_date::text;

      if v_status in ('pending','missing') then
        insert into public.submissions (
          id, user_id, submission_type_id, date, work_summary, tasks_details,
          status, locked, submitted_at, locked_at, uploaded_ip, version_number, parent_submission_id, file_path
        ) values (
          v_sub_id, v_user.id, 'st_daily', v_date, '', '',
          v_status, false, null, null, '10.0.0.' || v_idx, 1, null, ''
        )
        on conflict (id) do nothing;
      else
        v_submitted_at := (v_date::timestamp + (case when v_status='late' then interval '19 hours' else interval '9 hours' end) + (v_idx || ' minutes')::interval) at time zone 'utc';
        v_summary := v_summaries[ 1 + ((v_day + v_idx) % 10) ];
        v_tasks   := v_tasks_arr[ 1 + ((v_day + v_idx) % 5) ];

        insert into public.submissions (
          id, user_id, submission_type_id, date, work_summary, tasks_details,
          status, locked, submitted_at, locked_at, uploaded_ip, version_number, parent_submission_id, file_path
        ) values (
          v_sub_id, v_user.id, 'st_daily', v_date, v_summary, v_tasks,
          v_status,
          (v_status in ('submitted','revision_approved')),
          v_submitted_at, v_submitted_at,
          '10.0.0.' || v_idx,
          (case when v_status='revision_approved' then 2 else 1 end),
          null,
          'employees/' || split_part(v_user.name,' ',1) || '/' || to_char(v_date,'YYYY/MM/DD') || '/log.pdf'
        )
        on conflict (id) do nothing;
      end if;
    end loop;
  end loop;
end $$;

----------------------------------------------------------------
-- REVISIONS (first 8 revision_requested / revision_approved submissions)
----------------------------------------------------------------
do $$
declare
  v_sub record;
  v_count int := 0;
begin
  for v_sub in
    select * from public.submissions
     where status in ('revision_requested','revision_approved')
     order by date desc
     limit 8
  loop
    v_count := v_count + 1;
    insert into public.revisions (id, submission_id, user_id, reason, status, admin_id, admin_note, created_at, decided_at)
    values (
      'rev_' || v_sub.id,
      v_sub.id,
      v_sub.user_id,
      case when v_count % 2 = 0
           then 'Need to update the work summary with the latest figures.'
           else 'Uploaded the wrong version of the file, please allow re-upload.' end,
      case when v_sub.status = 'revision_approved' then 'approved'::public.revision_status else 'pending'::public.revision_status end,
      case when v_sub.status = 'revision_approved' then 'u_admin' else null end,
      case when v_sub.status = 'revision_approved' then 'Approved — re-upload allowed.' else null end,
      coalesce(v_sub.submitted_at, now()),
      case when v_sub.status = 'revision_approved' then now() else null end
    )
    on conflict (id) do nothing;
  end loop;
end $$;

----------------------------------------------------------------
-- BACKUP LOGS
----------------------------------------------------------------
insert into public.backup_logs (id, admin_id, file_name, file_path, size_bytes, started_at, completed_at, created_at, status) values
  ('bk_0','u_admin','office_uploads_backup_today.zip',     'D:\OfficeSystemStorage\backups\office_uploads_backup_today.zip',     28000000, now() - interval '1 hour',  now() - interval '1 hour' + interval '5 seconds',  now() - interval '1 hour',  'completed'),
  ('bk_1','u_admin','office_uploads_backup_yesterday.zip', 'D:\OfficeSystemStorage\backups\office_uploads_backup_yesterday.zip', 29500000, now() - interval '1 day',   now() - interval '1 day'  + interval '5 seconds',  now() - interval '1 day',   'completed'),
  ('bk_2','u_admin','office_uploads_backup_2days.zip',     'D:\OfficeSystemStorage\backups\office_uploads_backup_2days.zip',     31000000, now() - interval '2 days',  now() - interval '2 days' + interval '5 seconds',  now() - interval '2 days',  'completed')
on conflict (id) do nothing;

----------------------------------------------------------------
-- NOTIFICATIONS
----------------------------------------------------------------
insert into public.notifications (id, user_id, type, title, body, link, read, created_at) values
  ('n1','u_admin',   'warning','4 overdue submissions',  'Action required across Design and Development.', '/admin/submissions', false, now()),
  ('n2','u_admin',   'info',   'New revision request',   'Sarah Miller requested a revision for May log.', '/admin/revisions',   false, now()),
  ('n3','u_admin',   'success','Backup completed',       'Nightly backup finished successfully.',          '/admin/backups',     true,  now() - interval '1 day'),
  ('n4','u_employee','info',   'Welcome back, John',     'You have submitted 5 of 5 days this week.',      null,                 false, now()),
  ('n5','u_employee','success','Revision approved',      'Your revision request was approved.',            '/my-submissions',    false, now() - interval '1 day'),
  ('n6','u_manager', 'info',   'Team weekly summary',    '14 of 17 submissions submitted on time.',        '/admin/submissions', false, now())
on conflict (id) do nothing;

----------------------------------------------------------------
-- ACTIVITY LOGS — a few examples (trigger keeps newest 1000)
----------------------------------------------------------------
insert into public.activity_logs (id, user_id, action, target_type, target_id, ip, user_agent) values
  ('log_login_admin','u_admin',   'auth.login',          'session',    null,         '192.168.1.10', 'Mozilla/5.0 Chrome/120'),
  ('log_login_emp',  'u_employee','auth.login',          'session',    null,         '192.168.1.42', 'Mozilla/5.0 Chrome/120'),
  ('log_login_mgr',  'u_manager', 'auth.login',          'session',    null,         '192.168.1.55', 'Mozilla/5.0 Chrome/120'),
  ('log_backup',     'u_admin',   'backup.run',          'backup',     'bk_0',       '192.168.1.10', 'Mozilla/5.0 Chrome/120')
on conflict (id) do nothing;
