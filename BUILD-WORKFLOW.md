# BlueIsles — Build Workflow & Stack Reference

> **Living document.** Updated as the build progresses. Use it as a reusable
> implementation flow for future SaaS / website projects.
>
> - **Project:** BlueIsles — after-school program management platform
> - **Started:** 2026-07-16
> - **Last updated:** 2026-07-17
> - **Repo status:** live on GitHub + Netlify (login works). Term-1 MVP complete — modules A–E, H, I + dashboard + analytics. Remaining: Surveys (F, Phase 2); in progress: bulk-attendance buttons + weekly timetable view

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
| `supabase/migrations/` | Versioned SQL schema (`0001_init`, `0002_profile_on_signup`, `0003_ai_analytics`) |
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
| 16 | Jul 17 | **Live on Netlify** — env vars set, production deploy green (login works) | Netlify env + deploy (commit `3e7141e`) |

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
| Dev server | `npm run dev` → http://localhost:3000 |
| Production build | `npm run build` |
| Start built app | `npm run start` |
| Lint | `npm run lint` |
| Apply DB migrations | `supabase db push` (via Supabase CLI) |
| Seed demo data | run `supabase/seed.sql` |

---

## 8. How to use / update this doc

- **Copy:** open the file, select all — it's plain Markdown.
- **Download:** it lives at the repo root as `BUILD-WORKFLOW.md`.
- **Render as columns:** view on GitHub or any Markdown previewer; tables show as columns.
- **Updating:** I append a new row to the Build log (§5) and adjust the stack /
  connector tables (§1–§2) each time we add a tool, integration, or module.
  Ask me to "update the workflow doc" any time.
