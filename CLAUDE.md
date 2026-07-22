# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository. Read this
first, then consult the deeper references it points to.

## What this is

**BlueIsles** is an after-school program management platform for nonprofits and
school districts: participant enrollment, program/session planning, attendance
(including an offline kiosk), surveys, recognition, analytics, and funder-ready
reports. It is a multi-tenant SaaS — every row is scoped to an `org_id` and
protected by Postgres Row-Level Security.

Two companion docs at the repo root carry the long-form context:

- **`blueprint.md`** — the product spec: modules (A–I), full data model, user
  roles, feature requirements (referenced throughout as `FR-*`). This is the
  source of truth for *what* to build.
- **`BUILD-WORKFLOW.md`** — the living build log and stack reference: a
  chronological record of every shipped step, the reusable implementation
  recipe, and the command/env-var reference. **Append a row to §5 (Build log)
  whenever you ship a new module or integration**, and keep the stack/connector
  tables current.

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router) | Server Components + Server Actions |
| UI | **React 19**, **TypeScript** (strict) | |
| Styling | **Tailwind CSS v4** (via `@tailwindcss/postcss`) + per-route `.css` files | No `tailwind.config.js` — v4 is CSS-first |
| DB + Auth | **Supabase** (Postgres + Auth) via `@supabase/ssr` | RLS enforced |
| Data fetching | **TanStack React Query** | client-side server-state |
| Validation | **Zod** | forms, imports, server actions |
| Spreadsheets | **xlsx (SheetJS)** | import wizard + report/Excel export |
| Hosting | **Netlify** (`@netlify/plugin-nextjs`) | Node 22 build; Node 24 local |

## Commands

```bash
npm install            # install deps
npm run dev            # dev server (http://localhost:3000)
npm run dev -- -p 3210 # dev on an alternate port
npm run build          # production build (also the Netlify build command)
npm run start          # serve the built app
npm run lint           # ESLint (eslint-config-next, core-web-vitals + TS)
```

There is **no test suite** in this repo. "Verifying" a change means: it builds
(`npm run build`), it lints clean (`npm run lint`), and the affected screen
renders correctly. Do not claim tests pass — there are none to run.

## Environment variables

Set locally in `.env.local` (git-ignored) and in the **Netlify UI** for
production. There is no `.env.local.example` committed — pull values from the
Supabase dashboard (Project Settings → API).

| Variable | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Supabase endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe (RLS enforced) | Publishable anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only secret** | Bypasses **all** RLS. Only the report cron uses it |
| `RESEND_API_KEY` | Server-only secret | Scheduled report email (via Resend) |

**Never** put a service-role or Resend key in a `NEXT_PUBLIC_*` var or import it
into a client component. `lib/supabase/admin.ts` throws loudly if the key is
missing rather than silently returning empty results.

## Repository layout

```
app/
  (marketing)/        Public landing pages
  (app)/              Authenticated app — one folder per module
    dashboard/  participants/  programs/  attendance/  calendar/
    timetable/  surveys/  recognition/  analytics/  reports/
    import/     settings/
    layout.tsx        App shell (sidebar, auth gate) — wraps every (app) route
  api/                Route handlers (attendance/sync, calendar/[token])
  kiosk/[id]/         Full-screen offline check-in (outside the app shell)
  survey/[token]/     Public survey form (anonymous, token-gated)
  login/  no-org/     Auth + onboarding edges
  layout.tsx          Root layout; globals.css
components/           Shared UI: app-nav, import-wizard, checkin-roster,
                      *-form.tsx, sparkline, charts/, ui/
lib/                  Server + shared logic (see below)
supabase/
  migrations/         Versioned SQL schema (000N_*.sql) — source of truth
  seed.sql            Demo data
netlify/functions/    Scheduled functions (send-reports.mts — hourly cron)
sample-data/          CSV fixtures for the import wizard
proxy.ts              Middleware entry (Supabase session refresh)
*-mockup.html         Early static design mockups (reference only)
```

### Key `lib/` modules

- `supabase/server.ts` — server client (server components, actions, route
  handlers). Runs as the signed-in user; **RLS applies**. Use this by default.
- `supabase/client.ts` — browser client for client components.
- `supabase/middleware.ts` — session refresh, invoked from `proxy.ts`.
- `supabase/admin.ts` — **service-role** client, RLS-bypassing. Server-only,
  no-session code only (the cron). Never reach for it to "make a query work."
- `auth-context.ts` — `requireAppContext()` (redirects) and `getAppContext()`
  (returns `null` for APIs). Both resolve the user + active org membership +
  role. **Every authenticated page/action starts here.**
- `metrics.ts` — canonical metric definitions (attendance rate, ADA, retention,
  unduplicated served, …). **Never re-derive a metric inline** — import it from
  here so report footers stay defensible to funders.
- `flags.ts` — the derived alert engine (chronic absence + staff-ratio breach).
  Computed live from data, nothing persisted. Thresholds are org-configurable
  (`org_settings`) with code defaults.
- `nav.ts` — single source of truth for the sidebar + screen headers.
- `reports.ts`, `report-render.ts`, `report-scheduler.ts`, `mailer.ts` — report
  building, rendering, scheduling, and email delivery (shared by the screen's
  "Send now" and the Netlify cron).
- `ics.ts` — hand-rolled RFC 5545 writer for per-site calendar feeds.
- `dashboard.ts`, `attendance.ts`, `recognition.ts` — module data helpers.

## Conventions (follow these)

**Module structure.** Each `(app)/<module>/` folder is self-contained:
- `page.tsx` — server component that fetches data and renders the screen.
- `actions.ts` — `"use server"` mutations (server actions) for that module.
- `<module>.css` — scoped styles, imported by the page.
- `[id]/page.tsx` — detail routes where applicable.

**Server actions** (see `app/(app)/participants/actions.ts` for the pattern):
1. Start with `const ctx = await requireAppContext();`.
2. Authorize by role, e.g. `if (!["admin","director","staff"].includes(ctx.role)) return;`
   (viewers are read-only).
3. Read `FormData`, validate (Zod for anything non-trivial).
4. Query through `createClient()` — always filter `.eq("org_id", ctx.orgId)`.
5. `revalidatePath(...)` every affected route so the UI refreshes.

**Multi-tenancy is non-negotiable.** Every table has `org_id`; every query
filters on it *and* RLS enforces it as a backstop. Do not write a query that
could read or write across orgs. New tables must `enable row level security`
with `org_read` / `org_write` policies matching `0001_init.sql`.

**Roles:** `admin` > `director` > `staff` > `viewer`. Viewers are read-only.
Gate mutations on role in the server action, not just the UI.

**Database changes = new migration.** Never edit an existing
`supabase/migrations/000N_*.sql`. Add the next-numbered file. Migrations are
applied by hand (paste into the Supabase SQL editor) — the CLI/DB password is
not available in this environment — then verified over the REST API. State in
your summary that a migration needs to be applied.

**Metrics + definitions** live only in `lib/metrics.ts`. `late` counts as
attended; `excused` is excluded from attendance denominators. Match this
everywhere (it's what `flags.ts` and the reports assume).

**Styling** is Tailwind utilities plus per-route CSS files with scoped class
names (e.g. `.app-*`, `.link-btn`). There's a gradient design system in
`app/(app)/app.css`; reuse its tokens and the shared `page-head`, `card-icon`,
`nav-icons`, and `sparkline` components rather than reinventing them.

**"students" → "participants".** The product deliberately uses *participant*
(the school "Student ID" field keeps its name). Keep this terminology in UI copy.

## Deployment

Netlify builds via `npm run build` (config in `netlify.toml`, Node 22). The
Next.js runtime is auto-installed by `@netlify/plugin-nextjs`. Env vars are set
in the Netlify UI, not committed. `netlify/functions/send-reports.mts` runs
hourly (`schedule: "0 * * * *"`) on production deploys only — it uses the
service-role client because it has no user session, and it invokes the same
`runDueSchedules` path as the in-app "Send now" button.

## Git workflow

- Work on the branch you've been assigned; create it from the latest default
  branch if it doesn't exist. Never push to another branch without permission.
- Commit in small, self-describing steps (one shipped capability per commit),
  mirroring the existing history (see `git log`).
- Push with `git push -u origin <branch>`; retry transient network failures
  with exponential backoff.
- **Do not open a pull request unless explicitly asked.**
- After shipping a module or integration, append a row to `BUILD-WORKFLOW.md` §5.
