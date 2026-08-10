-- =====================================================================
-- 0011 — public parent registration (front door for non-staff).
--
-- Parents open a shareable link and submit a child + guardian + program
-- choice WITHOUT any account. As with surveys (0005) and calendar feeds
-- (0007), anon touches only two SECURITY DEFINER functions and never the
-- base tables, so RLS stays deny-by-default. Submissions land in a pending
-- queue (registrations) — they never write straight into the live roster.
-- =====================================================================

create type registration_status as enum ('pending', 'approved', 'rejected');

-- Programs a parent may choose from are opt-in, so staff control what's public.
alter table programs
  add column if not exists accepting_registrations boolean not null default false;

-- The shareable link. One secret token per org (multiple allowed / revocable).
create table if not exists registration_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  label text not null default 'Registration',
  token text not null unique,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists registration_links_org_idx on registration_links (org_id);

-- The pending queue. Parent-entered data lives here until staff approve it,
-- at which point real participant/guardian/enrollment rows are created (0012).
create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  link_id uuid references registration_links(id) on delete set null,
  program_id uuid references programs(id) on delete set null,
  program_name text,                       -- snapshot, in case the program changes
  child_first text not null,
  child_last text not null,
  child_dob date,
  child_grade text,
  child_school text,
  guardian_first text,
  guardian_last text,
  guardian_phone text,
  guardian_email text,
  guardian_relationship text,
  photo_consent boolean not null default false,
  note text,
  status registration_status not null default 'pending',
  created_participant_id uuid references participants(id) on delete set null,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create index if not exists registrations_org_status_idx on registrations (org_id, status, created_at desc);

alter table registration_links enable row level security;
alter table registrations enable row level security;

-- Staff visibility + management; anon writes go through the RPC below only.
drop policy if exists registration_links_read on registration_links;
create policy registration_links_read on registration_links
  for select using (public.is_org_member(org_id));

drop policy if exists registration_links_write on registration_links;
create policy registration_links_write on registration_links
  for all
  using (public.is_org_member(org_id) and public.member_role(org_id) in ('admin', 'director'))
  with check (public.is_org_member(org_id) and public.member_role(org_id) in ('admin', 'director'));

drop policy if exists registrations_read on registrations;
create policy registrations_read on registrations
  for select using (public.is_org_member(org_id));

-- Reviewing (approve/reject) is an admin/director/staff update.
drop policy if exists registrations_write on registrations;
create policy registrations_write on registrations
  for update
  using (public.is_org_member(org_id) and public.member_role(org_id) in ('admin', 'director', 'staff'))
  with check (public.is_org_member(org_id) and public.member_role(org_id) in ('admin', 'director', 'staff'));

-- ---------------------------------------------------------------------
-- Read: the public form's data — org name + the programs open to register.
-- Returns null for an unknown or revoked token.
-- ---------------------------------------------------------------------
create or replace function public.get_registration_form(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'org', o.name,
    'programs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'category', p.category,
          'grade_min', p.grade_min,
          'grade_max', p.grade_max
        ) order by p.name
      )
      from programs p
      where p.org_id = l.org_id
        and p.status = 'active'
        and p.accepting_registrations
    ), '[]'::jsonb)
  )
  from registration_links l
  join orgs o on o.id = l.org_id
  where l.token = p_token
    and l.revoked_at is null
  limit 1;
$$;

revoke all on function public.get_registration_form(text) from public;
grant execute on function public.get_registration_form(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Write: accept one submission into the pending queue. org_id is taken from
-- the link (never the client); the chosen program must belong to that org and
-- be open. Text is length-capped to blunt abuse. Returns {ok, ref} / {ok,error}.
-- ---------------------------------------------------------------------
create or replace function public.submit_registration(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_link uuid;
  v_program uuid;
  v_program_name text;
  v_child_first text;
  v_child_last text;
  v_id uuid;
begin
  select l.id, l.org_id into v_link, v_org
  from registration_links l
  where l.token = p_token and l.revoked_at is null
  limit 1;
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'This registration link is invalid or closed.');
  end if;

  v_child_first := left(trim(coalesce(p_payload->>'child_first', '')), 80);
  v_child_last  := left(trim(coalesce(p_payload->>'child_last', '')), 80);
  if v_child_first = '' or v_child_last = '' then
    return jsonb_build_object('ok', false, 'error', 'A child first and last name are required.');
  end if;

  -- program is optional in the schema, but if given it must be open in this org
  if coalesce(p_payload->>'program_id', '') <> '' then
    select p.id, p.name into v_program, v_program_name
    from programs p
    where p.id = (p_payload->>'program_id')::uuid
      and p.org_id = v_org
      and p.status = 'active'
      and p.accepting_registrations
    limit 1;
    if v_program is null then
      return jsonb_build_object('ok', false, 'error', 'That program is not open for registration.');
    end if;
  end if;

  insert into registrations (
    org_id, link_id, program_id, program_name,
    child_first, child_last, child_dob, child_grade, child_school,
    guardian_first, guardian_last, guardian_phone, guardian_email, guardian_relationship,
    photo_consent, note
  ) values (
    v_org, v_link, v_program, v_program_name,
    v_child_first, v_child_last,
    nullif(p_payload->>'child_dob', '')::date,
    left(nullif(p_payload->>'child_grade', ''), 20),
    left(nullif(p_payload->>'child_school', ''), 120),
    left(nullif(p_payload->>'guardian_first', ''), 80),
    left(nullif(p_payload->>'guardian_last', ''), 80),
    left(nullif(p_payload->>'guardian_phone', ''), 40),
    left(nullif(p_payload->>'guardian_email', ''), 160),
    left(nullif(p_payload->>'guardian_relationship', ''), 40),
    coalesce((p_payload->>'photo_consent')::boolean, false),
    left(nullif(p_payload->>'note', ''), 1000)
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'ref', v_id);
end;
$$;

revoke all on function public.submit_registration(text, jsonb) from public;
grant execute on function public.submit_registration(text, jsonb) to anon, authenticated;
