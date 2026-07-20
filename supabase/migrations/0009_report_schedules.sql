-- =====================================================================
-- 0009 — scheduled report delivery (FR-H.4).
--
-- An hourly cron asks each active schedule "are you due right now, in your
-- own timezone?" rather than storing a precomputed next_run_at. That keeps
-- the logic DST-safe: no stored timestamp can drift when the clocks change.
-- last_sent_on (a DATE in the schedule's timezone) makes sending idempotent
-- — a schedule can only ever fire once per local day.
-- =====================================================================

create table if not exists report_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  -- which report: matches REPORT_TEMPLATES in lib/reports.ts
  template text not null check (template in ('program', 'attendance', 'funder')),
  cadence text not null check (cadence in ('weekly', 'monthly')),
  -- weekly: 0=Sunday .. 6=Saturday. monthly: 1..28 (avoids short months)
  day_of_week smallint check (day_of_week between 0 and 6),
  day_of_month smallint check (day_of_month between 1 and 28),
  hour smallint not null default 7 check (hour between 0 and 23),
  timezone text not null default 'America/New_York',
  -- how far back the report covers, ending the day it's sent
  lookback_days integer not null default 30 check (lookback_days between 1 and 400),
  recipients text[] not null check (array_length(recipients, 1) between 1 and 20),
  active boolean not null default true,
  last_sent_on date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  -- a weekly schedule needs a weekday; a monthly one needs a day of month
  constraint report_schedules_cadence_day check (
    (cadence = 'weekly' and day_of_week is not null)
    or (cadence = 'monthly' and day_of_month is not null)
  )
);

create index if not exists report_schedules_org_idx on report_schedules (org_id);

-- Delivery log — what actually went out, and what failed.
create table if not exists report_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  schedule_id uuid references report_schedules(id) on delete set null,
  template text not null,
  period_from date not null,
  period_to date not null,
  recipients text[] not null,
  status text not null check (status in ('sent', 'failed')),
  error text,
  triggered_by text not null default 'schedule' check (triggered_by in ('schedule', 'manual')),
  sent_at timestamptz not null default now()
);

create index if not exists report_deliveries_org_idx on report_deliveries (org_id, sent_at desc);

alter table report_schedules enable row level security;
alter table report_deliveries enable row level security;

drop policy if exists report_schedules_read on report_schedules;
create policy report_schedules_read on report_schedules
  for select using (public.is_org_member(org_id));

drop policy if exists report_schedules_write on report_schedules;
create policy report_schedules_write on report_schedules
  for all
  using (
    public.is_org_member(org_id)
    and public.member_role(org_id) in ('admin', 'director')
  )
  with check (
    public.is_org_member(org_id)
    and public.member_role(org_id) in ('admin', 'director')
  );

drop policy if exists report_deliveries_read on report_deliveries;
create policy report_deliveries_read on report_deliveries
  for select using (public.is_org_member(org_id));

-- Deliveries are written by the cron under the service role (which bypasses
-- RLS). The manual "Send now" path runs under the caller's own session, so it
-- needs an explicit insert policy — added in 0010.

-- PostgREST caches the schema; nudge it so the new tables are visible at once.
notify pgrst, 'reload schema';
