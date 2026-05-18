# Supabase migrations for NexTask

Run these in your Supabase dashboard → **SQL Editor** in numeric order. Every file is
idempotent — safe to re-run.

| # | File | Required | Notes |
|---|------|----------|-------|
| 00 | `00_extensions.sql` | yes | `pgcrypto`, `citext` |
| 01 | `01_enums.sql` | yes | All enum types |
| 02 | `02_tables.sql` | yes | 12 tables; `users.auth_user_id → auth.users(id)` |
| 03 | `03_indexes.sql` | yes | Performance indexes |
| 04 | `04_triggers.sql` | yes | `updated_at` + activity-log trimming |
| 05 | `05_views_rpcs.sql` | yes | Aggregations the dashboards/reports call |
| 06 | `06_seed.sql` | recommended | Full demo data (17 users, 14 days of submissions, projects, notifications) |
| 07 | `07_storage.sql` | yes | Creates private bucket `submissions` |
| 08 | `08_rls_policies.sql` | **Phase 2 only** | **Do NOT run yet** — flips on Row Level Security |
| 09 | `09_auth_seed.sql` | yes | Creates the three demo Supabase Auth users and links them to `public.users` |

## Order of operations

1. Open https://supabase.com/dashboard/project/wydphvbdyyxryxeqdbxk/sql/new
2. Paste **00 → 07** one at a time, hit **Run**, confirm "Success".
3. Paste **09** (auth seed) and run it. You should now see 3 rows in **Authentication → Users**.
4. (Optional, when ready to deploy) Paste **08** and run it. After this, the anon key can
   only access what RLS allows — see the per-table policies in the file.

## Verification queries

```sql
select count(*) from public.users;             -- expect 17
select count(*) from public.submission_types;  -- expect 5
select count(*) from public.departments;       -- expect 6
select count(*) from public.projects;          -- expect 5
select count(*) from public.submissions;       -- expect ~140-160
select count(*) from public.notifications;     -- expect 6
select count(*) from public.work_settings;     -- expect 1 (singleton)
select id, email from auth.users;              -- expect 3 demo accounts
```

## ⚠️ Security notes

- **RLS is OFF until you run `08_rls_policies.sql`.** While off, anyone with the anon key
  (which ships in the client bundle) can read and write every public table. This is fine
  for local development and demos but **must be enabled before any public deploy**.
- The `service_role` key in `.env.local` bypasses RLS entirely. It must **never** be imported
  from a client component — it is only used in `src/lib/supabase/admin.ts` and the
  `src/app/api/**` route handlers.
- The demo accounts all share password `password123`. Change them via Supabase
  dashboard before production.

## Demo credentials

| Role     | Email                       | Password      |
|----------|-----------------------------|---------------|
| admin    | admin@nexvision.local       | password123   |
| manager  | manager@nexvision.local     | password123   |
| employee | employee@nexvision.local    | password123   |
