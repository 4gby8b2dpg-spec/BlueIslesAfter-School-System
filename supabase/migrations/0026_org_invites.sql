-- =====================================================================
-- 0026 - org invites: admins add people by email
--
-- An admin adds a person by email and role. If that person already has an
-- account, they're attached straight away (see lib/invites.ts). If not, the
-- invite waits here and is claimed the first time they sign in with that
-- email. Only admins of the org can see or change invites.
-- =====================================================================

create table if not exists org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  email text not null,
  role user_role not null default 'staff',
  invited_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, email),
  constraint org_invites_email_lower check (email = lower(email))
);

alter table org_invites enable row level security;

create policy org_invites_admin on org_invites for all
using (public.is_org_member(org_id) and public.member_role(org_id) = 'admin')
with check (public.is_org_member(org_id) and public.member_role(org_id) = 'admin');
