-- =====================================================================
-- BlueIsles — 0001 init
-- The blueprint §2 schema as Postgres. Multi-tenant via org_id on every
-- table; RLS enabled everywhere and enforced server-side (blueprint §8.2).
-- Apply with:  supabase db push   (after `supabase link`)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- enums ----------
create type user_role         as enum ('admin','director','staff','viewer');
create type member_status     as enum ('invited','active','deactivated');
create type program_status    as enum ('planning','active','completed','archived');
create type enrollment_status as enum ('enrolled','waitlisted','withdrawn','completed');
create type enrollment_source as enum ('manual','import','waitlist_promo');
create type session_status    as enum ('scheduled','completed','cancelled');
create type session_role      as enum ('lead','assistant');
create type attendance_status as enum ('present','absent','excused','late');
create type attendance_source as enum ('roster','kiosk','bulk','import');
create type import_target     as enum ('participants','attendance','enrollments','programs','survey_responses');
create type import_status     as enum ('mapping','validating','committed','rolled_back','failed');
create type survey_audience   as enum ('participants','guardians','staff','public');
create type survey_status     as enum ('draft','open','closed');
create type question_type     as enum ('multiple_choice','checkboxes','rating_1_5','scale_0_10','short_text','long_text','yes_no');
create type event_type        as enum ('field_trip','meeting','closure','other');
create type flag_type         as enum ('chronic_absence','missing_attendance','ratio_breach','capacity_waitlist','low_survey_rating');
create type flag_severity     as enum ('info','warning','critical');

-- ---------- shared updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ---------- tenancy & identity ----------
create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- one row per auth user; app profile data
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- exactly one role per (org, user) — blueprint §1.3
create table memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role user_role not null,
  status member_status not null default 'invited',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  address text,
  timezone text not null default 'America/New_York',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_site_access (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  site_id uuid not null references sites(id) on delete cascade,
  unique (user_id, site_id)
);

create table terms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- participants & guardians ----------
create table imports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  file_name text not null,
  file_size int,
  sheet_name text,
  target_type import_target not null,
  mapping_template_id uuid,
  status import_status not null default 'mapping',
  rows_total int not null default 0,
  rows_committed int not null default 0,
  rows_skipped int not null default 0,
  rows_errored int not null default 0,
  run_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table participants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  external_id text,                       -- school/student id; dedupe key
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  grade text,
  school text,
  gender text,
  medical_notes text,                     -- treat as sensitive (encrypt in prod)
  photo_consent boolean not null default false,
  custom_fields jsonb not null default '{}'::jsonb,
  source_import_id uuid references imports(id),
  deleted_at timestamptz,                 -- soft delete
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, external_id)
);

create table guardians (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  email text,
  is_emergency_contact boolean not null default false,
  authorized_pickup boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table guardians_link (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  guardian_id uuid not null references guardians(id) on delete cascade,
  relationship text,
  unique (participant_id, guardian_id)
);

-- ---------- programs, activities, sessions ----------
create table programs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  site_id uuid references sites(id),
  term_id uuid references terms(id),
  name text not null,
  category text,
  description_goals text,
  capacity int,
  grade_min text,
  grade_max text,
  ratio_target int,
  funding_source text,                    -- grant/funder tag — slices every metric
  status program_status not null default 'planning',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  name text not null,
  default_duration_min int,
  default_room text,
  materials text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  status enrollment_status not null default 'enrolled',
  enrolled_on date,
  withdrawn_on date,
  waitlist_position int,
  source enrollment_source not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_id, program_id)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  activity_id uuid references activities(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  room text,
  recurrence_id uuid,                     -- groups occurrences of one series
  status session_status not null default 'scheduled',
  attendance_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table session_staff (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role_on_session session_role not null default 'lead',
  unique (session_id, user_id)
);

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  status attendance_status not null,
  time_in timestamptz,
  time_out timestamptz,
  picked_up_by text,
  recorded_by uuid references profiles(id),
  source attendance_source not null default 'roster',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, participant_id)
);

-- ---------- import provenance & templates ----------
create table import_mapping_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  target_type import_target not null,
  column_map jsonb not null default '{}'::jsonb,
  run_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table import_rows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  import_id uuid not null references imports(id) on delete cascade,
  row_number int,
  raw jsonb,
  outcome text,                           -- committed | skipped | errored
  created_record_table text,
  created_record_id uuid,                 -- enables one-click rollback (FR-A.6)
  created_at timestamptz not null default now()
);

-- ---------- surveys ----------
create table surveys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  title text not null,
  description text,
  audience survey_audience not null default 'participants',
  program_id uuid references programs(id),
  term_id uuid references terms(id),
  status survey_status not null default 'draft',
  is_anonymous boolean not null default false,
  public_token text unique,
  paired_survey_id uuid references surveys(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table survey_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  survey_id uuid not null references surveys(id) on delete cascade,
  position int not null default 0,
  prompt text not null,
  qtype question_type not null,
  options jsonb,
  required boolean not null default false
);

create table survey_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  survey_id uuid not null references surveys(id) on delete cascade,
  respondent_participant_id uuid references participants(id),
  respondent_guardian_id uuid references guardians(id),
  respondent_user_id uuid references profiles(id),
  submitted_at timestamptz not null default now()
);

create table survey_answers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  response_id uuid not null references survey_responses(id) on delete cascade,
  question_id uuid not null references survey_questions(id) on delete cascade,
  value jsonb
);

-- ---------- calendar, flags, audit ----------
create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  site_id uuid references sites(id),
  title text not null,
  event_type event_type not null default 'other',
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table flags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  flag_type flag_type not null,
  severity flag_severity not null default 'warning',
  participant_id uuid references participants(id) on delete cascade,
  program_id uuid references programs(id) on delete cascade,
  session_id uuid references sessions(id) on delete cascade,
  raised_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id)
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  actor_id uuid references profiles(id),
  action text not null,                   -- create | update | delete | export | login
  entity_table text,
  entity_id uuid,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);

-- ---------- indexes (FKs the app filters on constantly) ----------
create index on participants (org_id);
create index on enrollments (org_id, program_id);
create index on sessions (org_id, program_id, starts_at);
create index on attendance_records (org_id, session_id);
create index on attendance_records (participant_id);
create index on flags (org_id, resolved_at);
create index on audit_log (org_id, at);

-- ---------- attach updated_at triggers ----------
do $$
declare t text;
begin
  foreach t in array array[
    'orgs','profiles','memberships','sites','terms','imports','participants',
    'guardians','programs','activities','enrollments','sessions',
    'attendance_records','import_mapping_templates','surveys','calendar_events'
  ] loop
    execute format(
      'create trigger set_updated_at before update on %I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- =====================================================================
-- Row-Level Security (blueprint §8.2)
-- =====================================================================

-- Is the current user an active member of this org?
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

-- The current user's role in this org (null if not a member).
create or replace function public.member_role(p_org uuid)
returns user_role language sql stable security definer set search_path = public as $$
  select role from memberships
  where org_id = p_org and user_id = auth.uid() and status = 'active'
  limit 1;
$$;

-- Baseline policies on every org-scoped table:
--   * any active member may READ their org's rows
--   * admin/director/staff may WRITE (viewers are read-only)
-- Finer rules still to add per blueprint: Viewer PII exclusion, Staff limited to
-- their own sessions, audit_log append-only. Marked as follow-ups, not done here.
do $$
declare t text;
begin
  foreach t in array array[
    'sites','user_site_access','terms','imports','participants','guardians',
    'guardians_link','programs','activities','enrollments','sessions',
    'session_staff','attendance_records','import_mapping_templates','import_rows',
    'surveys','survey_questions','survey_responses','survey_answers',
    'calendar_events','flags','audit_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$
      create policy org_read on %I for select
        using (public.is_org_member(org_id))$p$, t);
    execute format($p$
      create policy org_write on %I for all
        using (public.is_org_member(org_id)
               and public.member_role(org_id) in ('admin','director','staff'))
        with check (public.is_org_member(org_id)
               and public.member_role(org_id) in ('admin','director','staff'))$p$, t);
  end loop;
end $$;

-- orgs / profiles / memberships need bespoke policies.
alter table orgs enable row level security;
create policy org_self_read on orgs for select using (public.is_org_member(id));

alter table profiles enable row level security;
create policy profile_self_rw on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

alter table memberships enable row level security;
create policy membership_read on memberships for select
  using (public.is_org_member(org_id));
create policy membership_admin on memberships for all
  using (public.is_org_member(org_id) and public.member_role(org_id) = 'admin')
  with check (public.is_org_member(org_id) and public.member_role(org_id) = 'admin');
