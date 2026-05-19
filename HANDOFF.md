# NexTask — Project Handoff

> A complete handoff brief for another AI/engineer. Read this once and you'll have the full picture: what the system is, how it's built, where every feature lives, what's in flight, and what to do next.

---

## 1. Product Overview

**NexTask** is an internal office submission and compliance management system for **NexVision Innovations**. It lets employees submit daily work to managers and admins, tracks compliance against working-day expectations, supports project lifecycles with approvals/revisions, and surfaces analytics through dashboards and reports.

**Roles**
- **Admin** — full control: users/employees, departments, submission types, all submissions, backups, settings (working days, holidays, auto-backup).
- **Manager** — sees and manages employees in their department, projects, approvals, and reports.
- **Employee** — views own work for the day, submits daily entries, sees personal calendar and submissions.

**Key flows**
1. Employee opens **My Daily Work** → sees today's required submission types → submits work.
2. Admin/Manager reviews **Submissions** → approves, requests revision, marks late, or *excuses* (holidays).
3. Calendar gives a month-wide view of compliance status per day for the current user; admins/managers can see team rollups.
4. Reports surface trends, top performers, late/missing counts.
5. Settings centralises working days, holidays, auto-backup schedule, and (new) **push notifications**.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 14.2.15** (App Router, TypeScript) |
| UI | Custom shadcn-style components on **Tailwind 3.4** + Radix UI primitives |
| State | **Zustand** (`authStore` persisted, `dataStore` for everything else) |
| Forms | `react-hook-form` + `zod` resolvers |
| Charts | `recharts` |
| Animations | `framer-motion` |
| Toasts | `sonner` |
| Icons | `lucide-react` |
| Backend / Auth / DB / Storage / Realtime | **Supabase** (PostgreSQL) |
| Server SDK | `@supabase/ssr` + `@supabase/supabase-js` |
| Web Push | **`web-push`** (server) + native Push API / Service Worker (client) |
| Tests | `vitest` (unit + integration), `@testing-library/react`, `msw` |
| Hosting | Vercel (`vercel.json` present) |

**Brand tokens (Tailwind)**
- Primary `#66B2B2`, hover `#5AA0A0`, soft `#EAF5F5`
- Ink: `#333333` / muted `#6B7280` / soft `#9CA3AF`
- Surface: subtle `#F7F9FB`, border `#E5E7EB`
- Status: success `#16A34A`, danger `#EF4444`, plus per-status chips (amber, violet, indigo, etc.)
- Shadows: `shadow-card`, `shadow-pop`

---

## 3. Repository Layout

```
nextask-app/
├── public/
│   ├── brand/ntlogo.jpg          ← logo (also used as PWA icon source)
│   ├── manifest.webmanifest      ← PWA manifest
│   └── sw.js                     ← Service worker (caching + push)
├── src/
│   ├── app/
│   │   ├── (app)/                ← authenticated app shell
│   │   │   ├── admin/            ← admin pages (employees, submissions, backups, departments, types, logs)
│   │   │   ├── manager/          ← manager pages (employees, projects, approvals)
│   │   │   ├── calendar/         ← shared calendar view
│   │   │   ├── dashboard/        ← role-aware dashboard
│   │   │   ├── my-work/          ← employee daily tasks (reads ?date= param)
│   │   │   ├── my-submissions/   ← employee history
│   │   │   ├── profile/          ← profile + account
│   │   │   ├── projects/         ← project workspace
│   │   │   ├── reports/          ← analytics
│   │   │   ├── settings/         ← preferences (working days, holidays, auto-backup, PUSH)
│   │   │   └── layout.tsx        ← wraps AppShell + useRequireAuth
│   │   ├── api/
│   │   │   ├── backups/          ← server backup runs
│   │   │   ├── logs/             ← activity log read
│   │   │   ├── users/            ← admin user creation (service_role)
│   │   │   └── push/             ← NEW: subscribe / unsubscribe / send
│   │   ├── login/                ← unauthenticated entry
│   │   ├── globals.css           ← Tailwind + iOS safe-area + zoom-prevent
│   │   └── layout.tsx            ← root: manifest, viewport, SW register, install prompt
│   ├── components/
│   │   ├── brand/                ← Logo
│   │   ├── cards/                ← StatCard etc.
│   │   ├── layouts/              ← AppShell, Sidebar, Header, PageHeader, MobileBottomNav (NEW)
│   │   ├── modals/               ← ConfirmModal, RunBackupModal, etc.
│   │   ├── pwa/                  ← NEW: ServiceWorkerRegister, InstallPrompt
│   │   └── ui/                   ← button, card, input, table, badge, dialog, etc.
│   ├── features/                 ← feature-grouped UI (employees, submissions, ...)
│   ├── hooks/
│   │   ├── useAuth.ts            ← useAuth, useRequireAuth, useRequireRole
│   │   ├── useAutoBackup.ts      ← polls + fires daily backup at configured time
│   │   ├── useBootstrap.ts       ← loads workspace data on login
│   │   ├── usePermission.ts
│   │   └── usePushNotifications.ts  ← NEW: subscribe/unsubscribe/permission
│   ├── lib/
│   │   ├── constants.ts          ← STATUSES (incl. "excused"), roles, etc.
│   │   ├── dates.ts              ← fmtDate, fmtBytes, nowISO, business-day helpers
│   │   ├── helpers.ts            ← uid, downloadBlob, etc.
│   │   ├── nav.ts                ← NAV_BY_ROLE for sidebar
│   │   ├── push.ts               ← NEW: VAPID utils + urlBase64ToUint8Array
│   │   ├── status.ts             ← STATUS_META (label/bg/fg/dot) + AVATAR_COLORS
│   │   ├── utils.ts              ← cn()
│   │   └── supabase/
│   │       ├── client.ts         ← browser client (anon)
│   │       ├── server.ts         ← server client (cookies)
│   │       ├── admin.ts          ← service_role client (SERVER ONLY)
│   │       ├── mappers.ts        ← db row ⇄ domain object
│   │       └── types.ts          ← DbSubmissionStatus etc.
│   ├── services/                 ← thin domain services over Supabase
│   │   ├── auth.service.ts
│   │   ├── backup.service.ts
│   │   ├── log.service.ts
│   │   ├── notification.service.ts   ← in-app + (NEW) fires web push on insert
│   │   ├── project.service.ts
│   │   ├── push.service.ts       ← NEW
│   │   ├── report.service.ts
│   │   ├── revision.service.ts
│   │   ├── submission.service.ts ← markStatus, submit, etc.
│   │   ├── submissionType.service.ts
│   │   ├── user.service.ts
│   │   └── workSettings.service.ts   ← working days, holidays, auto-backup
│   ├── store/
│   │   ├── authStore.ts          ← persisted user/session
│   │   └── dataStore.ts          ← all workspace data (zustand)
│   ├── types/                    ← shared TS types
│   ├── mock-data/                ← dev seed (replaced by Supabase in prod)
│   └── test/                     ← unit + integration suites
├── supabase/
│   └── migrations/               ← 00-14 sequential SQL migrations
└── .env.local                    ← Supabase + VAPID keys (gitignored)
```

---

## 4. Supabase Schema (high level)

Tables: `users`, `departments`, `submission_types`, `submissions`, `revisions`, `projects`, `project_revisions`, `holidays`, `work_settings`, `notifications`, `activity_logs`, `backups`, `push_subscriptions` *(new)*.

Enums: `user_role` (admin|manager|employee), `submission_status` (pending|submitted|late|missing|revision_requested|revision_approved|revision_rejected|locked|**excused**).

RLS: Strict by `auth.uid()` mapping to `public.users.auth_user_id`. Admin/manager get elevated `select`/`update` policies.

Storage: bucket `submissions` for file attachments.

Realtime: enabled for `notifications`, `submissions`, `projects`.

**Migrations in order:**
1. `00_extensions.sql` — `pgcrypto`, etc.
2. `01_enums.sql` — `user_role`, `submission_status` (initial 8 values)
3. `02_tables.sql` — all core tables
4. `03_indexes.sql`
5. `04_triggers.sql` — `updated_at`, audit triggers
6. `05_views_rpcs.sql`
7. `06_seed.sql`
8. `07_storage.sql` — submissions bucket
9. `08_rls_policies.sql`
10. `09_auth_seed.sql`
11. `10_realtime.sql`
12. `11_project_dates.sql`
13. `12_project_revisions.sql`
14. `13_excused_status.sql` — adds `'excused'` to `submission_status` enum *(NEW)*
15. `14_push_subscriptions.sql` — push subs table + RLS *(NEW)*

---

## 5. Auth & Authorization

- Login via Supabase email/password (`/login`).
- `useRequireAuth()` gates `(app)/layout.tsx`; redirects to `/login`.
- `useRequireRole(["admin"])` etc. for page-level role gates.
- API routes (`/api/users`, `/api/push/send`) re-verify the session via `createSupabaseServerClient()` and check `public.users.role`. The `service_role` key is only used in API routes (never in client bundles).

---

## 6. Recently Shipped Features (current session arc)

| Area | What changed | Files |
|---|---|---|
| Mobile fixes | Admin/manager `/employees` mobile responsive | `admin/employees/page.tsx`, `manager/employees/page.tsx` |
| Calendar | Single-click "View details" + real data | `calendar/page.tsx` |
| Deep link | `/my-work?date=YYYY-MM-DD` honored | `my-work/page.tsx` |
| Working days | Settings UI (Mon–Fri pills) | `settings/page.tsx`, `workSettings.service.ts` |
| Holidays | Settings CRUD + 2026 PH preset import | `settings/page.tsx` |
| Status override | Per-submission dropdown action | `admin/submissions/page.tsx` |
| Sudden holiday | "Mark date as holiday" + **bulk-excuse toast** | `admin/submissions/page.tsx` |
| Excused status | Added to enum, TS types, calendar legend | `lib/constants.ts`, `lib/status.ts`, `supabase/types.ts`, `calendar/page.tsx`, migration `13` |
| Backups | Full redesign with **Auto Backup Schedule** card (toggle, time, email, save, last/next status) | `admin/backups/page.tsx` |
| **PWA** | Manifest, service worker, install prompt, SW register | `public/manifest.webmanifest`, `public/sw.js`, `src/components/pwa/*`, `src/app/layout.tsx` |
| **Push notifications** | Subscribe/unsubscribe, server send via VAPID, in-app notification → web push, settings toggle + test button | `src/lib/push.ts`, `src/services/push.service.ts`, `src/hooks/usePushNotifications.ts`, `src/app/api/push/*`, `src/services/notification.service.ts`, `settings/page.tsx`, migration `14` |
| **Mobile nav** | Bottom tab bar on phones (< lg) | `src/components/layouts/MobileBottomNav.tsx`, `AppShell.tsx` |
| **Mobile chrome** | Safe-area insets, no iOS auto-zoom, tap-highlight off, scrollable body | `src/app/globals.css` |

---

## 7. PWA Architecture

### Manifest
`public/manifest.webmanifest` declares:
- `display: standalone`, `start_url: /dashboard`, `scope: /`
- `theme_color: #66B2B2`, `background_color: #F7F9FB`
- Icons (192/512, any + maskable) all point at `/brand/ntlogo.jpg`
- App shortcuts: My Work, Calendar, Submissions

### Service Worker (`public/sw.js`)
- **Install**: precaches shell (`/`, `/dashboard`, `/login`, manifest, logo)
- **Activate**: clears stale caches keyed on `CACHE_VERSION`
- **Fetch**: skips cross-origin + `/api/*`; navigation = network-first → cached shell fallback; static assets (`_next/static`, `/brand`, image/font/css/js) = cache-first
- **Push**: shows notification with `title`, `body`, `icon`, `badge`, `tag`, `data.url`, `vibrate`
- **Notification click**: focuses an existing tab (and navigates it) or opens a new one to `data.url`
- **Message**: handles `SKIP_WAITING` for immediate updates

### Service Worker Registration
`src/components/pwa/ServiceWorkerRegister.tsx`:
- Registers `/sw.js` with `scope: "/"`
- **Skipped in `NODE_ENV !== "production"`** to avoid stale-cache pain during dev
- Auto-reloads page once when a new SW takes control

### Install Prompt
`src/components/pwa/InstallPrompt.tsx`:
- Captures `beforeinstallprompt` on Chromium → custom "Install" CTA
- iOS Safari: shows manual "Share → Add to Home Screen" instructions after 3s
- Dismissal persisted in `localStorage` (`nextask.installPromptDismissed`)
- Hidden when `display-mode: standalone` (already installed)

### iOS / Mobile niceties
- Viewport: `viewportFit: "cover"` (notch-friendly)
- Safe-area inset padding on `body` + `.safe-bottom` utility
- Inputs forced to ≥16px on `< 640px` (prevents iOS auto-zoom)
- `appleWebApp.capable: true` in `metadata`

---

## 8. Web Push Architecture

### Keys (already in `.env.local`)
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BDS2I26tT0cOwHP-bDyS42Y4TKrs63xu5OfbarlWSoW0rSmrubgw0dL9tZpLpghZwOQZAkyqRjKz2BtyyPHhw4g
VAPID_PRIVATE_KEY=MprSxrZeUCDn8pXyOYWU11JB00OfF-2K5CroJsruqmY
VAPID_SUBJECT=mailto:admin@nextask.local
```
> ⚠️ The public key as supplied looked concatenated; the value above is the agent's best parse. If push subscribe rejects with "applicationServerKey is not valid", regenerate fresh keys with `npx web-push generate-vapid-keys` and replace both values + restart the dev server.

### Flow
1. User opens **Settings → Push Notifications** → clicks **Enable**.
2. `usePushNotifications.enable(userId)` → `pushService.subscribe(userId)`:
   - `Notification.requestPermission()`
   - `reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <VAPID> })`
   - `supabase.from("push_subscriptions").upsert({...}, { onConflict: "endpoint" })`
3. Whenever **anyone** calls `notificationService.push(...)` (existing in-app notification flow), it now **also** fires `POST /api/push/send` to wake that user's devices. Best-effort, fails silently if VAPID/subs missing.
4. `POST /api/push/send` (server, `runtime: nodejs`):
   - Authn via cookie session → loads caller profile
   - **Authz**: admin/manager can target anyone; others only themselves
   - Loads `push_subscriptions` for `userIds`
   - `webpush.sendNotification(...)` to each; **prunes dead endpoints** (404/410)
   - Returns `{ sent, failed, pruned }`

### Endpoints
| Route | Purpose |
|---|---|
| `POST /api/push/subscribe` | Server fallback to upsert a subscription (browser path is preferred via supabase-js). |
| `POST /api/push/unsubscribe` | Removes a subscription by `endpoint`. |
| `POST /api/push/send` | Server-side push delivery (privileged use). |

### Testing
- Settings → Push Notifications → **Enable** → **Send test**. Toast confirms `{ sent: 1 }`.
- Manually trigger any in-app notification (admin marking a submission) and the recipient gets a banner notification, even when the tab is closed.

---

## 9. Mobile Responsiveness

- **AppShell**: sidebar collapses to off-canvas drawer < `lg`; bottom tab nav appears < `lg`.
- **Bottom nav**: 5 role-aware destinations (dashboard, work/employees, submissions, calendar, settings/profile). Native-feeling with `env(safe-area-inset-bottom)`.
- **Main pad-bottom**: `pb-24` on mobile so content clears the bottom bar.
- **iOS auto-zoom prevention**: inputs forced to 16px on small screens.
- **Tap targets**: `-webkit-tap-highlight-color: transparent` on touch devices.
- **Recently-mobile-fixed pages**: `admin/employees`, `manager/employees`, `calendar`, `admin/submissions` (holiday banner + dropdown), `admin/backups` (auto-schedule card grids to 1 col on mobile).
- **Remaining audit candidates** (still likely fine but worth a spot-check after install): `reports`, deep `projects` detail, `admin/logs`. The general approach used elsewhere works: `grid` → `grid sm:grid-cols-2 md:grid-cols-3`, hide non-critical table columns with `hidden md:table-cell`, and let `PageHeader` actions wrap.

---

## 10. SQL Migrations to Apply (Copy-Paste into Supabase SQL Editor)

> Run each block **individually**. PostgreSQL won't let you `ALTER TYPE ... ADD VALUE` and use it in the same transaction.

### A. (If not yet applied) Add `excused` to submission status enum
```sql
ALTER TYPE public.submission_status ADD VALUE IF NOT EXISTS 'excused';
```

### B. Push subscriptions table + RLS (`14_push_subscriptions.sql`)
```sql
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "own_push_subscriptions_select" on public.push_subscriptions;
create policy "own_push_subscriptions_select"
  on public.push_subscriptions for select
  using (user_id in (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "own_push_subscriptions_insert" on public.push_subscriptions;
create policy "own_push_subscriptions_insert"
  on public.push_subscriptions for insert
  with check (user_id in (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "own_push_subscriptions_update" on public.push_subscriptions;
create policy "own_push_subscriptions_update"
  on public.push_subscriptions for update
  using (user_id in (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "own_push_subscriptions_delete" on public.push_subscriptions;
create policy "own_push_subscriptions_delete"
  on public.push_subscriptions for delete
  using (user_id in (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "admin_push_subscriptions_select" on public.push_subscriptions;
create policy "admin_push_subscriptions_select"
  on public.push_subscriptions for select
  using (exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.role = 'admin'));

drop policy if exists "admin_push_subscriptions_delete" on public.push_subscriptions;
create policy "admin_push_subscriptions_delete"
  on public.push_subscriptions for delete
  using (exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.role = 'admin'));
```

### C. Useful operational queries (not migrations)
```sql
-- See who's subscribed
select u.name, u.email, ps.user_agent, ps.last_seen_at
from push_subscriptions ps
join users u on u.id = ps.user_id
order by ps.last_seen_at desc;

-- Force-revoke all devices for a user
delete from push_subscriptions where user_id = (select id from users where email = 'foo@example.com');

-- Bulk excuse on a holiday
update submissions
set status = 'excused'
where date = '2026-05-18'
  and status in ('missing','late','pending');
```

---

## 11. Local Development

```powershell
cd nextask-app
npm install                 # web-push is in deps as of this session
npm run dev                 # http://localhost:3000
```

- `.env.local` must contain Supabase keys + VAPID keys (see `.env.example`).
- The service worker is **disabled in dev** intentionally. Test PWA + push by running `npm run build && npm start` (then visit `http://localhost:3000`).
- Push notifications require **HTTPS** OR `http://localhost`. Don't test push from a LAN IP without TLS.
- iOS push requires iOS 16.4+ AND the user must install the app to the home screen first.

### Useful scripts
| Script | Use |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Run prod build (needed for SW & push testing) |
| `npm test` / `test:unit` | Unit tests |
| `npm run test:integration` | Integration tests |
| `npm run test:coverage` | Coverage report |
| `npm run lint` | ESLint |

---

## 12. Known Gotchas / Things to Watch

1. **Service worker stale cache** — bump `CACHE_VERSION` in `public/sw.js` on any breaking shell change. The SW already self-purges old caches.
2. **VAPID keys** — if push subscription throws, the keys may be malformed. Run `npx web-push generate-vapid-keys` and replace both values; restart server.
3. **Excused enum** — `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction it was added. If you see `55P04 unsafe use of new value`, you ran the ALTER and the UPDATE in one go. Run them as **separate** SQL editor executions.
4. **`/api/push/send` requires Node runtime** — already set with `export const runtime = "nodejs"`. Don't change to `edge` without a different web-push impl.
5. **iOS install flow** — must use Safari, must add to home screen, then push permission can be requested *from the installed PWA*, not the browser tab.
6. **`useAutoBackup`** runs in `AppShell` and polls every 30 s; it fires `backupService.run()` at the configured time and opens a `mailto:` draft. It does not yet send real email — that's a deliberate placeholder.
7. **Realtime** is enabled on `notifications` and `submissions`. The `useBootstrap` hook subscribes; check there if you change tables.

---

## 13. Suggested Next Steps

- [ ] **Run migration B** (push_subscriptions) in production Supabase.
- [ ] (Optional) Rotate VAPID keys for production.
- [ ] (Optional) Add `/icons/icon-192.png` / `/icons/icon-512.png` proper square PNGs (currently reuses `ntlogo.jpg` — works but PNGs render better as maskable icons).
- [ ] Verify push end-to-end on a real iPhone (16.4+) and Android device after installing the PWA.
- [ ] Audit remaining pages (`reports`, `projects` detail, `admin/logs`) at 360 px width.
- [ ] Wire `useAutoBackup` to a real transactional email sender (Resend / SendGrid) instead of `mailto:`.
- [ ] Consider migrating fire-and-forget `notificationService.push` → push to a server queue so missed pushes can retry.

---

## 14. Quick "What lives where" Index

- **Login** → `src/app/login/page.tsx`
- **Dashboard** → `src/app/(app)/dashboard/page.tsx`
- **My Work** → `src/app/(app)/my-work/page.tsx` (reads `?date=`)
- **Calendar** → `src/app/(app)/calendar/page.tsx`
- **Admin Submissions (override + holiday + bulk-excuse)** → `src/app/(app)/admin/submissions/page.tsx`
- **Admin Backups (auto-backup schedule card)** → `src/app/(app)/admin/backups/page.tsx`
- **Settings (working days, holidays, PUSH, auto-backup, reset)** → `src/app/(app)/settings/page.tsx`
- **AppShell + nav** → `src/components/layouts/AppShell.tsx` + `Sidebar.tsx` + `MobileBottomNav.tsx`
- **PWA shell** → `public/manifest.webmanifest`, `public/sw.js`, `src/components/pwa/*`, `src/app/layout.tsx`
- **Push** → `src/lib/push.ts`, `src/services/push.service.ts`, `src/hooks/usePushNotifications.ts`, `src/app/api/push/*/route.ts`
- **Notification fan-out (in-app + push)** → `src/services/notification.service.ts` (`push()` method)

You're caught up. Welcome to NexTask.
