-- =====================================================================
-- 0017 — narrative builder (FR-H.4).
--
-- A narrative is an ordered list of blocks for a board-deck-style report
-- body: text paragraphs, KPI callouts, and chart snapshots. Blocks are
-- stored as loose jsonb (same convention as participants.custom_fields) —
-- {type:"text", body} | {type:"kpi", label, value} |
-- {type:"chart", caption, dataUrl}. KPI and chart blocks are snapshots
-- captured at add-time, not live-recomputed, so a saved narrative stays
-- stable for a board deck even as underlying data changes later.
-- =====================================================================

create table if not exists report_narratives (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  title text not null,
  blocks jsonb not null default '[]'::jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists report_narratives_org_idx on report_narratives (org_id, updated_at desc);

alter table report_narratives enable row level security;

drop policy if exists report_narratives_read on report_narratives;
create policy report_narratives_read on report_narratives
  for select using (public.is_org_member(org_id));

drop policy if exists report_narratives_write on report_narratives;
create policy report_narratives_write on report_narratives
  for all
  using (
    public.is_org_member(org_id)
    and public.member_role(org_id) in ('admin', 'director')
  )
  with check (
    public.is_org_member(org_id)
    and public.member_role(org_id) in ('admin', 'director')
  );

drop trigger if exists set_report_narratives_updated on report_narratives;
create trigger set_report_narratives_updated
  before update on report_narratives
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
