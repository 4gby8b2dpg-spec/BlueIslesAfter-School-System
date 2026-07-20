-- =====================================================================
-- 0008 — staff-scoped calendar feeds, completing FR-E.5
-- ("ICS feed per site/staff member").
--
-- Adds an optional user_id to calendar_feeds. When set, the feed carries
-- only the sessions that staff member is assigned to (session_staff), plus
-- the org's non-session events — closures and trips affect everyone.
-- =====================================================================

alter table calendar_feeds
  add column if not exists user_id uuid references profiles(id) on delete cascade;

-- A feed is scoped to a site OR a staff member, never both.
alter table calendar_feeds
  drop constraint if exists calendar_feeds_scope_check;
alter table calendar_feeds
  add constraint calendar_feeds_scope_check
  check (site_id is null or user_id is null);

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
          and (
            f.user_id is null
            or exists (
              select 1 from session_staff ss
              where ss.session_id = s.id
                and ss.user_id = f.user_id
            )
          )
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
