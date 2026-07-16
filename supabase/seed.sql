-- =====================================================================
-- BlueIsles demo seed — run in the Supabase SQL Editor.
-- Safe to re-run: demo data seeds only once; the membership link at the
-- bottom is idempotent, so it attaches whichever auth users exist now.
--
-- ORDER: create your login first (Dashboard → Authentication → Users →
-- Add user, tick "Auto Confirm User"), THEN run this.
-- =====================================================================

-- Auto-create a profile row whenever someone signs up (also in migration 0002).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Demo data (seeds once)
-- ---------------------------------------------------------------------
do $$
declare
  v_org uuid;
  v_site_e uuid; v_site_n uuid; v_term uuid;
  v_hw uuid; v_rob uuid; v_soc uuid; v_art uuid;
  v_part uuid;
  v_names text[] := array[
    'Aaliyah Brooks','Marcus Chen','Dana Ellis','Sofia Ramirez','Liam Okafor',
    'Noah Patel','Emma Nguyen','Jayden Cole','Maya Johnson','Ethan Rivera',
    'Ava Thompson','Isaiah Ford','Chloe Kim','Diego Morales','Zoe Bennett',
    'Kai Robinson','Layla Hassan','Mason Reed','Priya Shah','Oliver Grant',
    'Amara Diallo','Lucas Freeman'];
  v_name text; i int := 0; wk int; v_grade int;
begin
  if exists (select 1 from orgs where name = 'Sunrise After-School Network') then
    raise notice 'Demo already seeded — skipping data insert.';
    return;
  end if;

  insert into orgs(name) values ('Sunrise After-School Network') returning id into v_org;
  insert into sites(org_id,name,timezone) values (v_org,'Eastside Center','America/New_York') returning id into v_site_e;
  insert into sites(org_id,name,timezone) values (v_org,'Northgate Center','America/New_York') returning id into v_site_n;
  insert into terms(org_id,name,starts_on,ends_on) values (v_org,'Summer 2026','2026-06-01','2026-08-15') returning id into v_term;

  insert into programs(org_id,site_id,term_id,name,category,capacity,grade_min,grade_max,ratio_target,funding_source,status)
    values (v_org,v_site_e,v_term,'Homework Help','tutoring',24,'3','8',12,'21st CCLC','active') returning id into v_hw;
  insert into programs(org_id,site_id,term_id,name,category,capacity,grade_min,grade_max,ratio_target,funding_source,status)
    values (v_org,v_site_e,v_term,'Robotics Club','STEM',16,'4','8',8,'STEM Grant','active') returning id into v_rob;
  insert into programs(org_id,site_id,term_id,name,category,capacity,grade_min,grade_max,ratio_target,funding_source,status)
    values (v_org,v_site_n,v_term,'Soccer Skills','sports',20,'3','7',10,'Parks Dept','active') returning id into v_soc;
  insert into programs(org_id,site_id,term_id,name,category,capacity,grade_min,grade_max,ratio_target,funding_source,status)
    values (v_org,v_site_n,v_term,'Art Studio','arts',18,'3','8',9,'Arts Council','active') returning id into v_art;

  -- participants + enrollments
  foreach v_name in array v_names loop
    i := i + 1;
    v_grade := (i % 6) + 3;
    insert into participants(org_id,first_name,last_name,date_of_birth,grade,school,photo_consent)
      values (v_org, split_part(v_name,' ',1), split_part(v_name,' ',2),
              (current_date - ((v_grade + 6) || ' years')::interval)::date,
              v_grade::text, 'Lincoln Elementary', (i % 4 <> 0))
      returning id into v_part;

    insert into enrollments(org_id,participant_id,program_id,status,enrolled_on,source)
      values (v_org,v_part,v_hw,'enrolled','2026-06-02','import');
    if i <= 16 then
      insert into enrollments(org_id,participant_id,program_id,status,enrolled_on,source)
        values (v_org,v_part,v_rob,'enrolled','2026-06-02','import');
    end if;
    if i % 2 = 0 then
      insert into enrollments(org_id,participant_id,program_id,status,enrolled_on,source)
        values (v_org,v_part,v_soc,'enrolled','2026-06-03','manual');
    end if;
    if i % 3 = 0 then
      insert into enrollments(org_id,participant_id,program_id,status,enrolled_on,source)
        values (v_org,v_part,v_art,'enrolled','2026-06-03','manual');
    end if;
  end loop;

  -- historical weekly sessions (last 8 weeks) — completed, drive the trend
  for wk in 1..8 loop
    insert into sessions(org_id,program_id,starts_at,ends_at,room,status) values
      (v_org,v_hw, now() - (wk*7||' days')::interval - interval '1 hour', now() - (wk*7||' days')::interval + interval '30 min','Rm 104','completed'),
      (v_org,v_rob,now() - (wk*7||' days')::interval,                       now() - (wk*7||' days')::interval + interval '90 min','Lab','completed'),
      (v_org,v_soc,now() - (wk*7||' days')::interval + interval '30 min',   now() - (wk*7||' days')::interval + interval '2 hours','Field','completed'),
      (v_org,v_art,now() - (wk*7||' days')::interval + interval '1 hour',   now() - (wk*7||' days')::interval + interval '150 min','Studio','completed');
  end loop;

  -- today's sessions — populate "Today's schedule"
  insert into sessions(org_id,program_id,starts_at,ends_at,room,status) values
    (v_org,v_hw, current_date + time '15:30', current_date + time '17:00','Rm 104','scheduled'),
    (v_org,v_rob,current_date + time '15:30', current_date + time '17:00','Lab','scheduled'),
    (v_org,v_soc,current_date + time '16:15', current_date + time '17:30','Field','scheduled');
  -- a couple more later this week -> raises "sessions this week"
  insert into sessions(org_id,program_id,starts_at,ends_at,room,status) values
    (v_org,v_art,current_date + interval '1 day' + time '16:00', current_date + interval '1 day' + time '17:30','Studio','scheduled'),
    (v_org,v_hw, current_date + interval '2 days' + time '15:30', current_date + interval '2 days' + time '17:00','Rm 104','scheduled');

  -- attendance for completed sessions (~85% present, some late/absent)
  insert into attendance_records(org_id,session_id,participant_id,status,source)
    select s.org_id, s.id, e.participant_id,
      (case when random() < 0.85 then 'present'
            when random() < 0.66 then 'late'
            else 'absent' end)::attendance_status,
      'roster'
    from sessions s
    join enrollments e on e.program_id = s.program_id and e.org_id = s.org_id and e.status = 'enrolled'
    where s.org_id = v_org and s.status = 'completed';

  -- flags -> "Needs attention" + at-risk KPI
  insert into flags(org_id,flag_type,severity,participant_id)
    select v_org,'chronic_absence','warning',id from participants where org_id = v_org order by random() limit 3;
  insert into flags(org_id,flag_type,severity,session_id)
    select v_org,'missing_attendance','critical',id from sessions where org_id = v_org and status='completed' order by random() limit 1;
  insert into flags(org_id,flag_type,severity,program_id) values (v_org,'capacity_waitlist','warning',v_rob);

  -- recent imports
  insert into imports(org_id,file_name,target_type,status,rows_total,rows_committed) values
    (v_org,'summer_roster.csv','participants','committed',22,22),
    (v_org,'june_attendance.xlsx','attendance','committed',140,138);

  raise notice 'Seeded demo org %', v_org;
end $$;

-- ---------------------------------------------------------------------
-- Link every existing auth user to the demo org as admin (idempotent).
-- Run-safe: re-run this file after creating your login to attach it.
-- ---------------------------------------------------------------------
insert into public.profiles (id, email, full_name)
  select id, email, coalesce(raw_user_meta_data->>'full_name', split_part(email,'@',1))
  from auth.users
  on conflict (id) do nothing;

insert into public.memberships (org_id, user_id, role, status)
  select o.id, u.id, 'admin', 'active'
  from public.orgs o cross join auth.users u
  where o.name = 'Sunrise After-School Network'
  on conflict (org_id, user_id) do nothing;

-- Summary so you can confirm it worked:
select
  (select count(*) from orgs)                as orgs,
  (select count(*) from programs)            as programs,
  (select count(*) from participants)        as participants,
  (select count(*) from enrollments)         as enrollments,
  (select count(*) from sessions)            as sessions,
  (select count(*) from attendance_records)  as attendance,
  (select count(*) from flags)               as flags,
  (select count(*) from memberships)         as memberships;
