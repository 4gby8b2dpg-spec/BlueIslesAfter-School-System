-- =====================================================================
-- 0023 - normalize registration program choices
--
-- The JSON column remains temporarily for compatibility with older screens
-- and rows. New and existing choices are also represented relationally.
-- =====================================================================

create table if not exists registration_program_choices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  registration_id uuid not null references registrations(id) on delete cascade,
  program_id uuid references programs(id) on delete set null,
  position smallint not null,
  program_name text not null,
  created_at timestamptz not null default now(),
  unique (registration_id, position),
  unique (registration_id, program_id)
);

create index if not exists registration_program_choices_registration_idx
  on registration_program_choices (registration_id);

create index if not exists registration_program_choices_program_idx
  on registration_program_choices (program_id)
  where program_id is not null;

alter table registration_program_choices enable row level security;

drop policy if exists registration_program_choices_read on registration_program_choices;
create policy registration_program_choices_read on registration_program_choices
  for select using (public.is_org_member(org_id));

drop policy if exists registration_program_choices_write on registration_program_choices;
create policy registration_program_choices_write on registration_program_choices
  for all
  using (public.is_org_member(org_id) and public.member_role(org_id) in ('admin','director','staff'))
  with check (public.is_org_member(org_id) and public.member_role(org_id) in ('admin','director','staff'));

-- Backfill only well-formed choices that still belong to the registration's
-- organization. Stale choices remain in the JSON snapshot for review.
insert into registration_program_choices
  (org_id, registration_id, program_id, position, program_name)
select
  r.org_id,
  r.id,
  p.id,
  item.position::smallint,
  coalesce(item.choice->>'name', p.name)
from registrations r
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(r.program_choices) = 'array' then r.program_choices
    else '[]'::jsonb
  end
) with ordinality as item(choice, position)
join programs p
  on (item.choice->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 and p.id = (item.choice->>'id')::uuid
 and p.org_id = r.org_id
on conflict (registration_id, position) do nothing;

create or replace function public.sync_registration_program_choices()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from registration_program_choices
  where registration_id = new.id;

  insert into registration_program_choices
    (org_id, registration_id, program_id, position, program_name)
  select
    new.org_id,
    new.id,
    p.id,
    item.position::smallint,
    coalesce(item.choice->>'name', p.name)
  from jsonb_array_elements(
    case
      when jsonb_typeof(new.program_choices) = 'array' then new.program_choices
      else '[]'::jsonb
    end
  ) with ordinality as item(choice, position)
  join programs p
    on (item.choice->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   and p.id = (item.choice->>'id')::uuid
   and p.org_id = new.org_id
  on conflict (registration_id, position) do update
    set program_id = excluded.program_id,
        program_name = excluded.program_name;

  return new;
end;
$$;

drop trigger if exists registrations_sync_program_choices on registrations;
create trigger registrations_sync_program_choices
after insert or update of program_choices on registrations
for each row execute function public.sync_registration_program_choices();
