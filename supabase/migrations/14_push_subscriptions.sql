-- 14_push_subscriptions.sql
-- Stores Web Push (VAPID) subscriptions per user/device.
-- One row per unique browser endpoint. A user can have many devices.
--
-- IMPORTANT: requires the `users` table from earlier migrations.

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null references public.users (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- ── Row Level Security ────────────────────────────────────────────────
alter table public.push_subscriptions enable row level security;

-- Users see + manage only their own subscriptions
drop policy if exists "own_push_subscriptions_select" on public.push_subscriptions;
create policy "own_push_subscriptions_select"
  on public.push_subscriptions for select
  using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

drop policy if exists "own_push_subscriptions_insert" on public.push_subscriptions;
create policy "own_push_subscriptions_insert"
  on public.push_subscriptions for insert
  with check (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

drop policy if exists "own_push_subscriptions_update" on public.push_subscriptions;
create policy "own_push_subscriptions_update"
  on public.push_subscriptions for update
  using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

drop policy if exists "own_push_subscriptions_delete" on public.push_subscriptions;
create policy "own_push_subscriptions_delete"
  on public.push_subscriptions for delete
  using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

-- Admins can read / delete any (for broadcast and cleanup)
drop policy if exists "admin_push_subscriptions_select" on public.push_subscriptions;
create policy "admin_push_subscriptions_select"
  on public.push_subscriptions for select
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid() and u.role = 'admin'
    )
  );

drop policy if exists "admin_push_subscriptions_delete" on public.push_subscriptions;
create policy "admin_push_subscriptions_delete"
  on public.push_subscriptions for delete
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid() and u.role = 'admin'
    )
  );
