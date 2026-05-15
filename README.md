# NexTask — NexVision Innovations

Local-first, internal **office submission & compliance management** MVP. Built with Next.js 14 (App Router), TypeScript, Tailwind, Zustand and Radix.

> Tagline: *Track. Submit. Comply.*

---

## Quickstart

```powershell
cd nextask-app
npm install
npm run dev
```

Open http://localhost:3000 → you will be redirected to `/login`.

### Demo accounts (password: `password123`)

| Role     | Email                        | Name        |
|----------|------------------------------|-------------|
| Admin    | `admin@nexvision.local`      | Admin       |
| Manager  | `manager@nexvision.local`    | Sarah Lee   |
| Employee | `employee@nexvision.local`   | John Doe    |

The login page has one-click "Sign in as …" cards for each demo user.

---

## What's inside

### Pages (20 routes)

- `/login` — split-screen brand login with demo quick-fill.
- `/dashboard` — role-routed:
  - **Employee**: today's status, week strip, submit form, recent submissions.
  - **Admin / Manager**: KPI tiles, daily-trend line chart, status donut, dept compliance, overdue list, quick actions.
- `/my-work` — submit today's work + recent table.
- `/my-submissions` — filterable history with revision request flow + CSV export.
- `/calendar` — month grid colour-coded by submission status.
- `/reports` — 6 report types with export modal (CSV / Excel-compatible / PDF preview).
- `/profile`, `/settings` — personal info, demo data reset.
- `/admin/employees` — search, dept filter, create/edit modal, deactivate.
- `/admin/submissions` — full filters (q, date, dept, status), unlock action, CSV export.
- `/admin/revisions` — pending / approved / rejected tabs, approve & reject flow.
- `/admin/projects` — card grid with status & progress.
- `/admin/backups` — run backup with animated progress, history table.
- `/admin/activity-log` — full audit trail with CSV export.
- `/admin/users-roles` — 3-role permission matrix.

### Submission model

**Hybrid**: every employee files one daily submission; managers/admins can also submit. Submissions are **locked on submit**; correcting requires a **revision request → admin approval → unlock** cycle, fully audited.

### Architecture

```
UI (pages, modals, forms)
  └─ services/* (sole entry, audit-logged)
       └─ Zustand stores (persisted to localStorage)
            └─ seed.ts (mock data)
```

- `src/types` — domain types
- `src/lib` — constants, dates, helpers, status palette
- `src/services` — auth, submission, revision, report, backup, project, user, notification, log
- `src/store` — `authStore`, `dataStore` (both persisted)
- `src/components/ui` — ShadCN-style primitives over Radix
- `src/components/modals` — Submission details, Revision request/decision, Confirm, Export, Employee form, Project form, Run backup
- `src/features/dashboards` — Employee & Admin dashboards
- `src/components/charts` — recharts wrappers (Line, Donut) + WeekStrip

### Brand

- Primary `#66B2B2` · Hover `#5AA0A0` · Soft `#EAF5F5` · Ink `#333333`
- Inter font · `ntlogo.jpg` in `public/brand/`
- Chip palette: teal, violet, peach, amber, rose, indigo, mint

---

## Scripts

| Command          | Purpose                          |
|------------------|----------------------------------|
| `npm run dev`    | Dev server on port 3000          |
| `npm run build`  | Production build                 |
| `npm start`      | Run the production build         |
| `npm run lint`   | Lint (also runs in CI build)     |

---

## Notes

- All data is **client-side only** (localStorage). Use **Settings → Reset demo data** to wipe and reseed.
- File attachments ≤ 1.5 MB are stored inline as data URLs; larger files store metadata only with a stub download.
- Reports export real CSV / Excel-compatible TSV / a plain-text "PDF" preview — fully local, no server needed.
- Backups are simulated: progress animation + a JSON snapshot stored in `localStorage`.
