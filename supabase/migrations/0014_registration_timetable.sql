-- =====================================================================
-- 0014 — registration timetable + one-program-per-day.
--
-- Parents now pick programs from a weekly timetable (one program per
-- weekday per child). A program's meeting days are derived from its
-- scheduled upcoming sessions, read in the site's timezone — so the
-- timetable appears as soon as staff populate the schedule, and a
-- program with no sessions yet is offered without a day constraint.
--
-- registrations gains program_choices (jsonb [{id,name}]) so one
-- submission can carry several programs; program_id/program_name keep
-- the first choice so existing screens and pending rows keep working.
-- =====================================================================

alter table registrations
  add column if not exists program_choices jsonb;

-- ---------------------------------------------------------------------
-- Read: org name + open programs, now with site, meeting days (ISO dow,
-- 1=Mon..7=Sun) and the typical start/end time — all from scheduled
-- future sessions in the site's timezone.
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
          'grade_max', p.grade_max,
          'site', st.name,
          'days', coalesce(sch.days, '[]'::jsonb),
          'start_time', sch.start_time,
          'end_time', sch.end_time
        ) order by p.name
      )
      from programs p
      left join sites st on st.id = p.site_id
      left join lateral (
        select
          jsonb_agg(distinct x.dow) as days,
          to_char(min(x.st_local), 'HH24:MI') as start_time,
          to_char(max(x.en_local), 'HH24:MI') as end_time
        from (
          select
            extract(isodow from (s.starts_at at time zone coalesce(st.timezone, 'America/New_York')))::int as dow,
            (s.starts_at at time zone coalesce(st.timezone, 'America/New_York'))::time as st_local,
            (s.ends_at   at time zone coalesce(st.timezone, 'America/New_York'))::time as en_local
          from sessions s
          where s.program_id = p.id
            and s.status = 'scheduled'
            and s.starts_at >= now()
        ) x
      ) sch on true
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
-- Write: accept p_payload.program_ids (jsonb array of uuid strings; falls
-- back to the old single program_id). Every id must be open in this org,
-- and no two chosen programs may meet on the same weekday — the same
-- rule the form enforces, re-checked here because the client is untrusted.
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
  v_ids uuid[];
  v_choices jsonb;
  v_first_id uuid;
  v_first_name text;
  v_child_first text;
  v_child_last text;
  v_conflicts int;
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

  -- Collect chosen program ids: new array form, or the legacy single field.
  if jsonb_typeof(p_payload->'program_ids') = 'array' then
    select array_agg(distinct v::uuid) into v_ids
    from jsonb_array_elements_text(p_payload->'program_ids') as t(v)
    where v <> '';
  elsif coalesce(p_payload->>'program_id', '') <> '' then
    v_ids := array[(p_payload->>'program_id')::uuid];
  end if;

  if v_ids is null or array_length(v_ids, 1) is null then
    return jsonb_build_object('ok', false, 'error', 'Please choose at least one program.');
  end if;
  if array_length(v_ids, 1) > 7 then
    return jsonb_build_object('ok', false, 'error', 'Please choose at most one program per day.');
  end if;

  -- Every chosen program must be open for registration in this org.
  select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
  into v_choices
  from programs p
  where p.id = any(v_ids)
    and p.org_id = v_org
    and p.status = 'active'
    and p.accepting_registrations;
  if v_choices is null or jsonb_array_length(v_choices) <> array_length(v_ids, 1) then
    return jsonb_build_object('ok', false, 'error', 'One of the chosen programs is not open for registration.');
  end if;

  -- One program per weekday: no two chosen programs may share a meeting day.
  select count(*) into v_conflicts
  from (
    select dow
    from (
      select distinct s.program_id,
        extract(isodow from (s.starts_at at time zone coalesce(st.timezone, 'America/New_York')))::int as dow
      from sessions s
      join programs p on p.id = s.program_id
      left join sites st on st.id = p.site_id
      where s.program_id = any(v_ids)
        and s.status = 'scheduled'
        and s.starts_at >= now()
    ) per_day
    group by dow
    having count(*) > 1
  ) clashes;
  if v_conflicts > 0 then
    return jsonb_build_object('ok', false, 'error', 'Please choose only one program per day.');
  end if;

  v_first_id := (v_choices->0->>'id')::uuid;
  v_first_name := v_choices->0->>'name';

  insert into registrations (
    org_id, link_id, program_id, program_name, program_choices,
    child_first, child_last, child_dob, child_grade, child_school,
    guardian_first, guardian_last, guardian_phone, guardian_email, guardian_relationship,
    photo_consent, note
  ) values (
    v_org, v_link, v_first_id, v_first_name, v_choices,
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
