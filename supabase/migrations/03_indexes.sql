-- 03_indexes.sql

create index if not exists submissions_user_date_idx       on public.submissions (user_id, date desc);
create index if not exists submissions_type_date_idx       on public.submissions (submission_type_id, date desc);
create index if not exists submissions_status_idx          on public.submissions (status);
create index if not exists submissions_date_idx            on public.submissions (date desc);

create index if not exists activity_logs_user_created_idx  on public.activity_logs (user_id, created_at desc);
create index if not exists activity_logs_action_idx        on public.activity_logs (action);
create index if not exists activity_logs_created_idx       on public.activity_logs (created_at desc);

create index if not exists revisions_submission_idx        on public.revisions (submission_id);
create index if not exists revisions_status_created_idx    on public.revisions (status, created_at desc);

create index if not exists notifications_user_read_idx     on public.notifications (user_id, read, created_at desc);

create index if not exists backup_logs_created_idx         on public.backup_logs (created_at desc);

create index if not exists attachments_submission_idx      on public.attachments (submission_id);

create index if not exists users_auth_user_idx             on public.users (auth_user_id);
create index if not exists users_role_idx                  on public.users (role);
create index if not exists users_department_idx            on public.users (department_id);
