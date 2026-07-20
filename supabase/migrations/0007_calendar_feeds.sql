-- =====================================================================
-- 0007 — ICS calendar feeds (FR-E.5).
--
-- Calendar apps (Google/Outlook/Apple) fetch a feed URL WITHOUT any session
-- cookie, so the feed is authorised by a secret token in the URL instead.
-- As with the public survey flow (0005), anon gets exactly one SECURITY
-- DEFINER function and no direct table access, so RLS stays deny-by-default
-- and nobody can enumerate feeds or their tokens.
-- =====================================================================

create table if not exists calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  -- null site_id = every site in the org
  site_id uuid references sites(id) on delete cascade,
  label text not null,
  token text not null unique,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists calendar_feeds_org_idx on calendar_feeds (org_id);

alter table calendar_feeds enable row level security;

drop policy if exists calendar_feeds_read on calendar_feeds;
create policy calendar_feeds_read on calendar_feeds
  for select using (public.is_org_member(org_id));

drop policy if exists calendar_feeds_write on calendar_feeds;
create policy calendar_feeds_write on calendar_feeds
  for all
  using (
    public.is_org_member(org_id)
    and public.member_role(org_id) in ('admin', 'director')
  )
  with check (
    public.is_org_member(org_id)
    and public.member_role(org_id) in ('admin', 'director')
  );

-- ---------------------------------------------------------------------
-- Read: resolve a token to its sessions + non-session events.
-- Returns null for an unknown or revoked token. Windowed to keep the feed
-- small — calendar clients only ever need the near past and next year.
-- ---------------------------------------------------------------------
create or replace function public.get_calendar_feed(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'label', f.label,
    'org', o.name,
    'events', coalesce((
      select jsonb_agg(x.e order by x.e ->> 'starts_at')
      from (
        select jsonb_build_object(
          'uid', s.id,
          'kind', 'session',
          'title', p.name,
          'room', s.room,
          'site', si.name,
          'starts_at', s.starts_at,
          'ends_at', s.ends_at,
          'all_day', false,
          'status', s.status
        ) as e
        from sessions s
        join programs p on p.id = s.program_id
        left join sites si on si.id = p.site_id
        where s.org_id = f.org_id
          and (f.site_id is null or p.site_id = f.site_id)
          and s.starts_at >= now() - interval '90 days'
          and s.starts_at <= now() + interval '365 days'

        union all

        select jsonb_build_object(
          'uid', ce.id,
          'kind', 'event',
          'title', ce.title,
          'room', null,
          'site', si2.name,
          'starts_at', ce.starts_at,
          'ends_at', ce.ends_at,
          'all_day', ce.all_day,
          'status', ce.event_type::text
        ) as e
        from calendar_events ce
        left join sites si2 on si2.id = ce.site_id
        where ce.org_id = f.org_id
          and (f.site_id is null or ce.site_id = f.site_id)
          and ce.starts_at is not null
          and ce.starts_at >= now() - interval '90 days'
          and ce.starts_at <= now() + interval '365 days'
      ) x
    ), '[]'::jsonb)
  )
  from calendar_feeds f
  join orgs o on o.id = f.org_id
  where f.token = p_token
    and f.revoked_at is null
  limit 1;
$$;

revoke all on function public.get_calendar_feed(text) from public;
grant execute on function public.get_calendar_feed(text) to anon, authenticated;
