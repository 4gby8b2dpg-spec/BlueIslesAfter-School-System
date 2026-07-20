# BlueIsles — Build Workflow & Stack Reference

> **Living document.** Updated as the build progresses. Use it as a reusable
> implementation flow for future SaaS / website projects.
>
> - **Project:** BlueIsles — after-school program management platform
> - **Started:** 2026-07-16
> - **Last updated:** 2026-07-18
> - **Repo status:** live on GitHub + Netlify (login works). Term-1 MVP complete — modules A–F, H, I + dashboard + analytics. Surveys (F) built (builder, public token form, results + xlsx). Phase 2 in progress: **chronic-absence + ratio flag engine** (`lib/flags.ts`, derived/live — feeds dashboard rail + at-risk KPI + participant flags, clickable alerts). Next: recognition/rewards, then pre/post survey pairing

---

## 1. Stack at a glance

| Layer | Tool / Service | Version | Role in the stack |
|---|---|---|---|
| Framework | **Next.js** (App Router) | 16.2.10 | Full-stack React framework — pages, routing, server actions |
| UI runtime | **React** | 19.2.4 | Component rendering |
| Language | **TypeScript** | ^5 | Type safety across app + server code |
| Styling | **Tailwind CSS** | v4 (via `@tailwindcss/postcss`) | Utility-first styling + per-module `.css` files |
| Database | **Supabase Postgres** | hosted | Primary data store |
| Auth | **Supabase Auth** | `@supabase/ssr` 0.12.3, `supabase-js` 2.110.7 | Login, sessions, row-level security (RLS) |
| Data fetching | **TanStack React Query** | 5.101.2 | Client-side caching / server-state |
| Validation | **Zod** | 4.4.3 | Schema validation (forms, imports, server actions) |
| Spreadsheet I/O | **xlsx (SheetJS)** | 0.18.5 | CSV/Excel parsing for the Data Import wizard |
| Hosting | **Netlify** | `@netlify/plugin-nextjs` | Build + deploy (Next.js runtime auto-installed) |
| Linting | **ESLint** | ^9 (`eslint-config-next`) | Code quality |
| Node (build) | **Node.js** | 22 on Netlify / 24 local | Runtime |

---

## 2. Connectors & integrations

| Connector | Direction | Where configured | Notes |
|---|---|---|---|
| Supabase → App | DB + Auth | `.env.local` (local), Netlify UI (prod) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Supabase Service Role | Server-only admin | `.env.local` / Netlify UI | `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS; import commit + seed only. **Never** `NEXT_PUBLIC_`, never committed |
| Supabase CLI | Local ↔ hosted DB | `supabase/config.toml` | Migrations + seed management |
| Netlify → GitHub/local | Deploy | `netlify.toml` | `command = npm run build`, `publish = .next` |
| Next.js middleware (proxy) | Session refresh | `proxy.ts` + `lib/supabase/middleware.ts` | Refreshes Supabase session on every non-static request |

---

## 3. Environment & secrets

| Variable | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Supabase project endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe (RLS enforced) | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only — secret** | Admin tasks that bypass RLS (import commit, seeding) |

Template lives in `.env.local.example`. Copy to `.env.local` and fill from
Supabase dashboard → Project Settings → API. Production values go in the
**Netlify UI**, not in git.

---

## 4. Repository map

| Path | Contents |
|---|---|
| `app/(marketing)/` | Public landing pages |
| `app/(app)/` | Authenticated app (dashboard, participants, programs, attendance, import, reports, analytics, surveys, calendar, settings) |
| `app/login/`, `app/no-org/` | Auth + onboarding edges |
| `components/` | Shared UI (`app-nav`, `import-wizard`, `checkin-roster`, forms, `charts/`, `ui/`) |
| `lib/` | `supabase/` (client/server/middleware), `nav`, `auth-context`, `dashboard`, `metrics`, `providers` |
| `supabase/migrations/` | Versioned SQL schema (`0001_init`, `0002_profile_on_signup`, `0003_ai_analytics`, `0004_profile_org_read`, `0005_survey_public`, `0006_org_settings`) |
| `supabase/seed.sql` | Demo data |
| `sample-data/` | `participants-sample.csv` for import testing |
| `blueprint.md` | Original product/feature blueprint |
| `*-mockup.html` | Early static mockups (landing, dashboard) |

---

## 5. Build log (chronological)

Each row = one committed step. Times are build order on 2026-07-16.

| # | Time | Milestone | Key files / tools |
|---|---|---|---|
| 0 | — | HTML mockups first (landing, dashboard) | `landing-mockup.html`, `dashboard-mockup.html` |
| 1 | 12:31 | Scaffold: Next.js app + Supabase schema + landing | `create-next-app`, `0001_init.sql` |
| 2 | 12:55 | Netlify build config | `netlify.toml` |
| 3 | 13:18 | Supabase CLI config | `supabase/config.toml` |
| 4 | 14:07 | Auth flow + live dashboard | `lib/supabase/*`, `app.css`, `0002_profile_on_signup.sql` |
| 5 | 14:50 | Navigable skeleton + demo seed + fail-safe proxy | `app-nav`, `coming-soon`, `lib/nav`, `seed.sql`, `proxy.ts` |
| 6 | 14:57 | Analytics Explorer + AI-ready schema | `analytics/page.tsx`, `0003_ai_analytics.sql` |
| 7 | 15:32 | **Module A** — Data Import wizard | `import-wizard.tsx`, `xlsx`, `participants-sample.csv` |
| 8 | 22:51 | **Module B** — Participants & Enrollment | `participants/` (list, detail, actions) |
| 9 | 23:07 | **Module D** — Attendance | `checkin-roster.tsx`, `attendance/` |
| 10 | 23:29 | **Module C** — Programs & Sessions | `programs/`, `new-program-form`, `new-session-form` |
| 11 | 23:36 | **Module H** — Reports | `reports/`, `report-actions.tsx` |
| 12 | Jul 17 | Copy alignment: "students" → "participants" (kept district Student ID) | app UI + landing prose |
| 13 | Jul 17 | **Module E** — Calendar (month view) | `calendar/`, categorical palette |
| 14 | Jul 17 | **Module I** — Settings/Admin (users/roles, sites, terms, audit log) | `settings/`, `0004_profile_org_read.sql` |
| 15 | Jul 17 | Site/term delete + deactivate; fix `.link-btn` scoping | `settings/`, `app.css` |
| 16 | Jul 17 | **Live on Netlify** — env vars set, production deploy green (login works) | Netlify env + deploy |
| 17 | Jul 17 | Attendance: bulk mark present/absent/late/excused | `attendance/`, `checkin-roster` (`662d70b`) |
| 18 | Jul 17 | **Module E+** — Weekly Timetable + site filters + bulk attendance | `calendar/`, site filter (`084af1c`) |
| 19 | Jul 17 | Programs delete w/ confirmation; Import full "Import as" options | `programs/`, `import-wizard` (`e865a23`) |
| 20 | Jul 17 | **Module F** — Surveys: builder, public token form, results + xlsx export | `surveys/`, `0005_survey_public.sql` (`bd4d8e0`) |
| 21 | Jul 17 | Survey form: memoize each question (cut re-render cost) | `surveys/` (`3a29d2f`) |
| 22 | Jul 18 | **Phase 2** — chronic-absence + ratio flag engine (derived/live) | `lib/flags.ts` → dashboard rail + at-risk KPI + participant flags (`1597603`) |
| 23 | Jul 18 | **Phase 2** — Recognition/rewards (derived badges, board, in-app + Adobe Express certificate) | `recognition/`, `lib/recognition.ts`, `print-button.tsx` |
| 24 | Jul 18 | **Phase 2** — Per-org configurable flag thresholds (admin Settings card → engine) | `0006_org_settings.sql` (applied to hosted DB), `lib/flags.ts` (`getFlagThresholds`), `settings/` (`3c8a7f1`) |
| 25 | Jul 18 | **Phase 2** — Waitlists: auto-waitlist over capacity + promote | `participants/actions.ts`, `programs/` (`230df69`) |
| 26 | Jul 19 | Program-page controls — "+ Add participant" searchable picker + inline capacity edit | `add-participant-form.tsx`, `edit-capacity-form.tsx` (`6b7ef32`) |
| 27 | Jul 19 | **FR-G.2** — Program-detail analytics: attendance trend + avg survey rating; extracted shared `Sparkline` | `components/sparkline.tsx`, `programs/[id]/` (`bb10a7e`) |
| 28 | Jul 19 | **FR-G.3** — Analytics Explorer v2: date range, funder metrics (unduplicated, avg daily), Excel export, canonical definitions | `analytics/`, `explorer-export.tsx` (`b7a11f0`) |
| 29 | Jul 19 | **FR-G.3** — Explorer over-time weekly trend view; `Sparkline` gains `yMin/yMax` + grid/axis | `analytics/`, `sparkline.tsx` (`7166804`) |
| 30 | Jul 19 | **Kiosk mode pt.1** — full-screen tap-to-present check-in, localStorage offline queue, idempotent sync API | `app/kiosk/`, `kiosk-checkin.tsx`, `api/attendance/sync/`, `lib/attendance.ts` (`541ed60`) |
| 31 | Jul 19 | **Kiosk mode pt.2** — hand-rolled service worker (network-first + cache fallback) for cold-start offline; Background Sync | `public/sw.js`, `sw-register.tsx` (`e78df6f`) |
| 32 | Jul 20 | **Visual refresh** — gradient design system: teal sidebar, welcome banner, KPI icon chips, spot icons on every page/card, gradient badges | `app.css` tokens, `page-head.tsx`, `nav-icons.tsx`, `card-icon.tsx` (`7472aad`) |
| 33 | Jul 20 | **FR-E.5** — ICS calendar feeds per site; token-authorised anon RPC, hand-rolled RFC 5545 writer | `0007_calendar_feeds.sql` (applied), `lib/ics.ts`, `api/calendar/[token]/` (`d9b104e`) |
| 34 | Jul 20 | **FR-E.5 complete** — staff-scoped feeds (own assigned sessions); extracted `buildReport` so cron + screen share one implementation | `0008_staff_calendar_feeds.sql` (applied), `lib/reports.ts` (`ea2fdfe`) |
| 35 | Jul 20 | **FR-H.4** — Scheduled report delivery: weekly/monthly email with Excel attachment, DST-safe due-logic, delivery log, "Send now" | `0009` + `0010` (applied), `lib/report-scheduler.ts`, `lib/mailer.ts`, `netlify/functions/send-reports.mts` (`17ab3b9`) |

**Phase 2 backlog complete.** Remaining setup: add `RESEND_API_KEY` to enable
actual sending — everything else is verified end-to-end.

---

## 6. Reusable implementation flow (the recipe)

Follow this order for the next SaaS / website build:

1. **Blueprint first** — write the product spec (`blueprint.md`): modules, data
   model, user roles. Decide module build order.
2. **Static mockups** — HTML/CSS mockups of the key screens to lock visual
   direction before wiring anything (`*-mockup.html`).
3. **Scaffold** — `npx create-next-app` (TypeScript + Tailwind + App Router).
4. **Database schema** — design tables as versioned Supabase migrations
   (`supabase/migrations/000x_*.sql`). Turn on RLS from the start.
5. **Deploy config early** — add `netlify.toml` + Supabase CLI config so the
   pipeline exists before the app grows.
6. **Auth + session plumbing** — Supabase SSR client/server/middleware, a
   fail-safe `proxy.ts`, and a live dashboard to prove the loop end-to-end.
7. **Navigable skeleton** — nav + "coming soon" stubs for every module, plus a
   demo seed so screens have data immediately.
8. **Build modules one at a time** — each as its own commit with its own
   `page.tsx`, `actions.ts` (server actions), and scoped `.css`. Import → core
   entities → activity tracking → reporting.
9. **Validate inputs with Zod**, cache reads with React Query, keep secrets
   server-side (service-role key only where RLS must be bypassed).
10. **Ship** — env vars into Netlify UI, push, deploy.

---

## 7. Command reference

| Task | Command |
|---|---|
| Install deps | `npm install` |
| Dev server | `npm run dev -- -p 3210` → http://localhost:3210 |
| Production build | `npm run build` |
| Start built app | `npm run start` |
| Lint | `npm run lint` |
| Apply DB migrations | Paste the migration file into the **Supabase SQL editor** and run it. (No Supabase CLI / DB password on this machine, so `supabase db push` isn't available — migrations are applied by hand, then verified over the REST API.) |
| Seed demo data | run `supabase/seed.sql` |

### Environment variables

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` + Netlify | Public. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` + Netlify | Publishable (`sb_publishable_…`). Browser-safe, **respects RLS**. |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` + Netlify | Secret (`sb_secret_…`). **Bypasses all RLS** — server-only, never in a `NEXT_PUBLIC_*` var or a client component. Needed by the report cron, which has no user session. |
| `RESEND_API_KEY` | `.env.local` + Netlify | Secret (`re_…`), "Sending access" scope. For scheduled report email. |

> Legacy Supabase JWT keys (`eyJ…`) can no longer be rotated — the project has
> migrated to publishable/secret keys and legacy keys are disabled. If a secret
> ever leaks, create a new secret key and revoke the old one; rotating new-style
> keys does **not** invalidate user sessions.

---

## 8. How to use / update this doc

- **Copy:** open the file, select all — it's plain Markdown.
- **Download:** it lives at the repo root as `BUILD-WORKFLOW.md`.
- **Render as columns:** view on GitHub or any Markdown previewer; tables show as columns.
- **Updating:** I append a new row to the Build log (§5) and adjust the stack /
  connector tables (§1–§2) each time we add a tool, integration, or module.
  Ask me to "update the workflow doc" any time.
