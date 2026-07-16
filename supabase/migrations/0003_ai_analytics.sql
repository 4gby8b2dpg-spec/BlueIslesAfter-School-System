-- =====================================================================
-- 0003 — AI analytics scaffolding (future-ready; no AI wired up yet).
-- Two tables so the schema never needs re-migrating when AI lands:
--   ai_insights   — AI-authored narrative insights (like `flags`, but prose)
--   ai_query_log  — every natural-language question + the SQL it produced,
--                   for audit, caching, and safety (minors' data).
-- AI features must stay read-only + human-in-the-loop; inserts here happen
-- server-side (service role / edge functions), never trusted from the client.
-- =====================================================================

create type ai_insight_kind as enum (
  'trend_change','anomaly','risk_summary','milestone','recommendation'
);
create type ai_query_status as enum ('ok','blocked','error');

create table ai_insights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  kind ai_insight_kind not null,
  title text not null,
  body text not null,                     -- generated narrative
  severity flag_severity not null default 'info',
  program_id uuid references programs(id) on delete cascade,
  participant_id uuid references participants(id) on delete cascade,
  metric_snapshot jsonb,                  -- the numbers behind the insight
  model text,                             -- e.g. 'claude-haiku-4-5'
  confidence numeric,                     -- 0..1, optional
  generated_at timestamptz not null default now(),
  dismissed_at timestamptz,
  dismissed_by uuid references profiles(id)
);
create index on ai_insights (org_id, dismissed_at);

create table ai_query_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  question text not null,                 -- the natural-language ask
  generated_sql text,                     -- what the model produced (read-only)
  result_summary jsonb,                   -- compact result / row count
  model text,
  status ai_query_status not null default 'ok',
  error text,
  created_at timestamptz not null default now()
);
create index on ai_query_log (org_id, created_at);

-- RLS: members read their org's insights/logs; admin/director may write.
-- (System inserts run via service role and bypass RLS.)
alter table ai_insights enable row level security;
create policy ai_insights_read on ai_insights for select
  using (public.is_org_member(org_id));
create policy ai_insights_write on ai_insights for all
  using (public.is_org_member(org_id) and public.member_role(org_id) in ('admin','director'))
  with check (public.is_org_member(org_id) and public.member_role(org_id) in ('admin','director'));

alter table ai_query_log enable row level security;
create policy ai_query_read on ai_query_log for select
  using (public.is_org_member(org_id) and public.member_role(org_id) in ('admin','director'));
create policy ai_query_write on ai_query_log for insert
  with check (public.is_org_member(org_id));
