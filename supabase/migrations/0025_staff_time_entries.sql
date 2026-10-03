-- =====================================================================
-- 0025 - staff time entries (clock in / clock out per site)
--
-- Staff clock in at a site and clock out when they leave. Admins and
-- directors see and correct everyone's entries for payroll tallies; staff
-- only ever see and close their own. Nothing deletes entries through the
-- app — a wrong entry is corrected, and every change goes to audit_log.
-- =====================================================================

create table if not exists staff_time_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  site_id uuid not null references sites(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  session_id uuid references sessions(id) on delete set null,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_time_entries_order
    check (clock_out_at is null or clock_out_at > clock_in_at)
);

create index if not exists staff_time_entries_org_user_idx
  on staff_time_entries (org_id, user_id, clock_in_at);

-- One open shift per person at a time.
create unique index if not exists staff_time_entries_one_open
  on staff_time_entries (user_id) where clock_out_at is null;

drop trigger if exists set_updated_at on staff_time_entries;
create trigger set_updated_at before update on staff_time_entries
  for each row execute function public.set_updated_at();

alter table staff_time_entries enable row level security;

create policy staff_time_read on staff_time_entries for select
using (
  public.is_org_member(org_id)
  and (user_id = auth.uid() or public.member_role(org_id) in ('admin', 'director'))
);

create policy staff_time_insert on staff_time_entries for insert
with check (
  public.is_org_member(org_id)
  and user_id = auth.uid()
  and public.member_role(org_id) in ('admin', 'director', 'staff')
);

-- Admins/directors can correct any entry. Everyone else can only update
-- their own still-open entry (that's how clock-out works). The app only
-- ever sets clock_out_at on that path.
create policy staff_time_update on staff_time_entries for update
using (
  public.is_org_member(org_id)
  and (
    public.member_role(org_id) in ('admin', 'director')
    or (user_id = auth.uid() and clock_out_at is null)
  )
)
with check (
  public.is_org_member(org_id)
  and (
    public.member_role(org_id) in ('admin', 'director')
    or user_id = auth.uid()
  )
);
