-- =====================================================================
-- 0013 — guardian communication log (FR-B.5).
--
-- A lightweight timeline of contact with a participant's guardians —
-- calls, emails, texts, meetings, notes — shown on the participant
-- profile. Staff-facing only; no anon access. Follows the standard
-- org_read / (admin|director|staff) org_write shape from 0001.
-- =====================================================================

create table if not exists contact_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  guardian_id uuid references guardians(id) on delete set null,  -- optional: which guardian
  kind text not null check (kind in ('call', 'email', 'text', 'meeting', 'note')),
  direction text check (direction in ('inbound', 'outbound')),   -- optional
  summary text not null,
  occurred_on date not null default current_date,
  logged_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists contact_log_participant_idx
  on contact_log (org_id, participant_id, occurred_on desc);

alter table contact_log enable row level security;

drop policy if exists contact_log_read on contact_log;
create policy contact_log_read on contact_log
  for select using (public.is_org_member(org_id));

drop policy if exists contact_log_write on contact_log;
create policy contact_log_write on contact_log
  for all
  using (public.is_org_member(org_id) and public.member_role(org_id) in ('admin', 'director', 'staff'))
  with check (public.is_org_member(org_id) and public.member_role(org_id) in ('admin', 'director', 'staff'));

-- Verification (avoids "Success. No rows returned" ambiguity).
select count(*) as contact_log_rows from contact_log;
