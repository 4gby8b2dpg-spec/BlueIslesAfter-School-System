-- =====================================================================
-- 0006 — per-org configurable thresholds for the derived flag engine
-- (lib/flags.ts). One row per org; the engine falls back to code defaults
-- when a row/column is absent, so this is additive and safe to apply late.
-- =====================================================================

create table if not exists org_settings (
  org_id uuid primary key references orgs(id) on delete cascade,
  chronic_warning_pct  int not null default 10,   -- absence % → warning flag
  chronic_critical_pct int not null default 20,   -- absence % → critical flag
  chronic_min_sessions int not null default 5,    -- min sessions before flagging
  ratio_default_target int,                        -- org-wide fallback participants:staff when a program has none
  updated_at timestamptz not null default now()
);

alter table org_settings enable row level security;

-- Any active member may read; only admins may change settings.
drop policy if exists org_settings_read on org_settings;
create policy org_settings_read on org_settings
  for select using (public.is_org_member(org_id));

drop policy if exists org_settings_admin on org_settings;
create policy org_settings_admin on org_settings
  for all
  using (public.is_org_member(org_id) and public.member_role(org_id) = 'admin')
  with check (public.is_org_member(org_id) and public.member_role(org_id) = 'admin');

drop trigger if exists set_org_settings_updated on org_settings;
create trigger set_org_settings_updated
  before update on org_settings
  for each row execute function public.set_updated_at();
