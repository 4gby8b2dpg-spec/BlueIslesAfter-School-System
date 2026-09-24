-- =====================================================================
-- 0024 - authorization, tenant integrity, and public endpoint hardening
-- =====================================================================

-- Replace the original broad policies. Viewers retain access to operational
-- reference data, but not participant/guardian/contact/response records.
do $$
declare
  t text;
  sensitive_tables text[] := array[
    'user_site_access', 'imports', 'participants', 'guardians',
    'guardians_link', 'enrollments', 'session_staff', 'attendance_records',
    'import_rows', 'surveys', 'survey_questions', 'survey_responses',
    'survey_answers', 'flags', 'audit_log'
  ];
  reference_tables text[] := array[
    'sites', 'terms', 'programs', 'activities', 'sessions',
    'session_recurrencies', 'import_mapping_templates', 'calendar_events'
  ];
begin
  -- session_recurrencies was introduced after the baseline policy loop and
  -- therefore has feature-specific policy names that must be removed too.
  drop policy if exists session_recurrencies_read on session_recurrencies;
  drop policy if exists session_recurrencies_write on session_recurrencies;

  foreach t in array sensitive_tables || reference_tables loop
    execute format('drop policy if exists org_read on %I', t);
    execute format('drop policy if exists org_write on %I', t);
  end loop;

  foreach t in array sensitive_tables loop
    execute format($policy$
      create policy org_sensitive_read on %I for select
      using (
        public.is_org_member(org_id)
        and public.member_role(org_id) in ('admin', 'director', 'staff')
      )
    $policy$, t);
  end loop;

  foreach t in array reference_tables loop
    execute format($policy$
      create policy org_reference_read on %I for select
      using (public.is_org_member(org_id))
    $policy$, t);
  end loop;

  -- Configuration and structural data may only be changed by administrators
  -- and directors. Staff-specific operational writes are declared separately.
  foreach t in array sensitive_tables || reference_tables loop
    if t <> 'audit_log' and t <> 'attendance_records' then
      execute format($policy$
        create policy org_manage on %I for all
        using (
          public.is_org_member(org_id)
          and public.member_role(org_id) in ('admin', 'director')
        )
        with check (
          public.is_org_member(org_id)
          and public.member_role(org_id) in ('admin', 'director')
        )
      $policy$, t);
    end if;
  end loop;
end $$;

-- Staff may record attendance only for sessions to which they are assigned.
create policy attendance_manage on attendance_records for all
using (
  public.is_org_member(org_id)
  and (
    public.member_role(org_id) in ('admin', 'director')
    or (
      public.member_role(org_id) = 'staff'
      and exists (
        select 1 from session_staff ss
        where ss.org_id = attendance_records.org_id
          and ss.session_id = attendance_records.session_id
          and ss.user_id = auth.uid()
      )
    )
  )
)
with check (
  public.is_org_member(org_id)
  and (
    public.member_role(org_id) in ('admin', 'director')
    or (
      public.member_role(org_id) = 'staff'
      and exists (
        select 1 from session_staff ss
        where ss.org_id = attendance_records.org_id
          and ss.session_id = attendance_records.session_id
          and ss.user_id = auth.uid()
      )
    )
  )
);

-- Keep the audit trail append-only while allowing all operational roles to
-- record actions. Existing migration 0015 removed update/delete policies.
drop policy if exists audit_append on audit_log;
create policy audit_append on audit_log for insert
with check (
  public.is_org_member(org_id)
  and public.member_role(org_id) in ('admin', 'director', 'staff')
  and actor_id = auth.uid()
);

-- Later feature tables did not inherit the 0001 policy loop. Tighten their
-- read/write policies explicitly.
drop policy if exists contact_log_read on contact_log;
create policy contact_log_read on contact_log for select
using (
  public.is_org_member(org_id)
  and public.member_role(org_id) in ('admin', 'director', 'staff')
);

drop policy if exists report_deliveries_read on report_deliveries;
create policy report_deliveries_read on report_deliveries for select
using (
  public.is_org_member(org_id)
  and public.member_role(org_id) in ('admin', 'director')
);

drop policy if exists report_schedules_read on report_schedules;
create policy report_schedules_read on report_schedules for select
using (
  public.is_org_member(org_id)
  and public.member_role(org_id) in ('admin', 'director')
);

drop policy if exists report_narratives_read on report_narratives;
create policy report_narratives_read on report_narratives for select
using (
  public.is_org_member(org_id)
  and public.member_role(org_id) in ('admin', 'director')
);

drop policy if exists registration_program_choices_read on registration_program_choices;
create policy registration_program_choices_read on registration_program_choices for select
using (
  public.is_org_member(org_id)
  and public.member_role(org_id) in ('admin', 'director', 'staff')
);

drop policy if exists registration_links_read on registration_links;
create policy registration_links_read on registration_links for select
using (
  public.is_org_member(org_id)
  and public.member_role(org_id) in ('admin', 'director')
);

drop policy if exists registrations_read on registrations;
create policy registrations_read on registrations for select
using (
  public.is_org_member(org_id)
  and public.member_role(org_id) in ('admin', 'director', 'staff')
);

drop policy if exists calendar_feeds_read on calendar_feeds;
create policy calendar_feeds_read on calendar_feeds for select
using (
  public.is_org_member(org_id)
  and public.member_role(org_id) in ('admin', 'director')
);

drop policy if exists ai_query_read on ai_query_log;
create policy ai_query_read on ai_query_log for select
using (
  public.is_org_member(org_id)
  and public.member_role(org_id) in ('admin', 'director')
);

-- Enforce that an attendance row cannot point across tenant boundaries.
alter table sessions add constraint sessions_org_id_id_key unique (org_id, id);
alter table participants add constraint participants_org_id_id_key unique (org_id, id);

alter table attendance_records
  add constraint attendance_records_org_session_fkey
  foreign key (org_id, session_id)
  references sessions (org_id, id)
  on delete cascade;

alter table attendance_records
  add constraint attendance_records_org_participant_fkey
  foreign key (org_id, participant_id)
  references participants (org_id, id)
  on delete cascade;

-- Bound anonymous submission bursts at the database boundary. These are a
-- final backstop; edge/CDN rate limiting can be layered on without changing
-- the data model.
create or replace function public.limit_public_registration_burst()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from registrations r
    where r.link_id = new.link_id
      and r.created_at >= now() - interval '1 minute'
  ) >= 10 then
    raise exception 'Registration rate limit exceeded';
  end if;
  return new;
end;
$$;

drop trigger if exists registrations_public_rate_limit on registrations;
create trigger registrations_public_rate_limit
before insert on registrations
for each row execute function public.limit_public_registration_burst();

create or replace function public.limit_public_survey_burst()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from survey_responses r
    where r.survey_id = new.survey_id
      and r.submitted_at >= now() - interval '1 minute'
  ) >= 30 then
    raise exception 'Survey rate limit exceeded';
  end if;
  return new;
end;
$$;

drop trigger if exists survey_responses_public_rate_limit on survey_responses;
create trigger survey_responses_public_rate_limit
before insert on survey_responses
for each row execute function public.limit_public_survey_burst();

alter table survey_answers
  add constraint survey_answers_value_size_ck
  check (pg_column_size(value) <= 8192);

-- Cap the number of submitted answers before the SECURITY DEFINER function
-- enters its insertion loop.
create or replace function public.submit_survey_response(p_token text, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_survey surveys%rowtype;
  v_response_id uuid;
  v_valid_qids uuid[];
  v_answer jsonb;
begin
  if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_answers, '[]'::jsonb)) > 100
     or pg_column_size(coalesce(p_answers, '[]'::jsonb)) > 65536 then
    raise exception 'Survey payload is too large';
  end if;

  select * into v_survey
  from surveys
  where public_token = p_token
    and status = 'open';

  if v_survey.id is null then
    raise exception 'Survey not available';
  end if;

  insert into survey_responses (org_id, survey_id)
  values (v_survey.org_id, v_survey.id)
  returning id into v_response_id;

  select coalesce(array_agg(id), '{}') into v_valid_qids
  from survey_questions
  where survey_id = v_survey.id;

  for v_answer in select * from jsonb_array_elements(p_answers)
  loop
    if (v_answer->>'question_id')::uuid = any (v_valid_qids) then
      insert into survey_answers (org_id, response_id, question_id, value)
      values (
        v_survey.org_id,
        v_response_id,
        (v_answer->>'question_id')::uuid,
        v_answer->'value'
      );
    end if;
  end loop;
end;
$$;

revoke all on function public.submit_survey_response(text, jsonb) from public;
grant execute on function public.submit_survey_response(text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
