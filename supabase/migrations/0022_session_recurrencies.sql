-- =====================================================================
-- 0022 - make session recurrence groups explicit
-- =====================================================================

create table if not exists session_recurrencies (
  id uuid primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists session_recurrencies_org_idx
  on session_recurrencies (org_id);

-- Existing recurrence IDs were already generated as stable grouping IDs.
insert into session_recurrencies (id, org_id)
select distinct recurrence_id, org_id
from sessions
where recurrence_id is not null
on conflict (id) do nothing;

alter table session_recurrencies enable row level security;

drop policy if exists session_recurrencies_read on session_recurrencies;
create policy session_recurrencies_read on session_recurrencies
  for select using (public.is_org_member(org_id));

drop policy if exists session_recurrencies_write on session_recurrencies;
create policy session_recurrencies_write on session_recurrencies
  for all
  using (public.is_org_member(org_id) and public.member_role(org_id) in ('admin','director','staff'))
  with check (public.is_org_member(org_id) and public.member_role(org_id) in ('admin','director','staff'));

drop trigger if exists session_recurrencies_set_updated_at on session_recurrencies;
create trigger session_recurrencies_set_updated_at
before update on session_recurrencies
for each row execute function public.set_updated_at();

create index if not exists sessions_recurrence_idx
  on sessions (recurrence_id)
  where recurrence_id is not null;

alter table sessions
  drop constraint if exists sessions_recurrence_id_fkey;

alter table sessions
  add constraint sessions_recurrence_id_fkey
  foreign key (recurrence_id)
  references session_recurrencies(id)
  on delete restrict;
