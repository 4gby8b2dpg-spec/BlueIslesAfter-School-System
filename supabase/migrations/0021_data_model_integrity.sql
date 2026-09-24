-- =====================================================================
-- 0021 - data model integrity and timestamp consistency
--
-- Additive cleanup for constraints and mutable-table timestamps. Lifecycle
-- changes and relational normalization are deferred until their writers are
-- updated in the application.
-- =====================================================================

-- Historical imports may retain their mapping template reference, but the
-- reference must point to a real template when present.
create index if not exists imports_mapping_template_idx
  on imports (mapping_template_id);

alter table imports
  drop constraint if exists imports_mapping_template_id_fkey;

alter table imports
  add constraint imports_mapping_template_id_fkey
  foreign key (mapping_template_id)
  references import_mapping_templates(id)
  on delete set null;

-- A flag must describe exactly one target entity.
alter table flags
  drop constraint if exists flags_exactly_one_target_ck;

alter table flags
  add constraint flags_exactly_one_target_ck
  check (num_nonnulls(participant_id, program_id, session_id) = 1);

create index if not exists sessions_activity_idx
  on sessions (activity_id);

create index if not exists session_staff_user_idx
  on session_staff (user_id);

create index if not exists survey_questions_survey_idx
  on survey_questions (survey_id);

create index if not exists survey_responses_survey_idx
  on survey_responses (survey_id);

create index if not exists survey_answers_response_idx
  on survey_answers (response_id);

create index if not exists survey_answers_question_idx
  on survey_answers (question_id);

create index if not exists flags_participant_idx
  on flags (participant_id)
  where participant_id is not null;

create index if not exists flags_program_idx
  on flags (program_id)
  where program_id is not null;

create index if not exists flags_session_idx
  on flags (session_id)
  where session_id is not null;

-- These tables are mutable or operationally managed. Existing rows receive
-- their creation/update timestamp at migration time.
alter table user_site_access
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table guardians_link
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table session_staff
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table survey_questions
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table flags
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table org_settings
  add column if not exists created_at timestamptz not null default now();

alter table calendar_feeds
  add column if not exists updated_at timestamptz not null default now();

alter table report_schedules
  add column if not exists updated_at timestamptz not null default now();

alter table registration_links
  add column if not exists updated_at timestamptz not null default now();

alter table registrations
  add column if not exists updated_at timestamptz not null default now();

do $$
declare
  table_name text;
  mutable_tables text[] := array[
    'user_site_access',
    'guardians_link',
    'session_staff',
    'survey_questions',
    'flags',
    'org_settings',
    'calendar_feeds',
    'report_schedules',
    'registration_links',
    'registrations'
  ];
begin
  foreach table_name in array mutable_tables loop
    execute format('drop trigger if exists %I on %I', table_name || '_set_updated_at', table_name);
    execute format(
      'create trigger %I before update on %I for each row execute function public.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end $$;

create index if not exists org_settings_updated_idx
  on org_settings (updated_at);

create index if not exists registrations_updated_idx
  on registrations (updated_at desc);
