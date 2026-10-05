-- =====================================================================
-- 0028 - fixes from the security audit
--
-- 1. SECURITY DEFINER helpers and trigger functions were executable through
--    /rest/v1/rpc by anonymous callers. Revoke that. RLS policies still call
--    is_org_member / member_role / shares_org_with as the signed-in user, so
--    those keep EXECUTE for `authenticated`.
-- 2. set_updated_at had a mutable search_path.
-- 3. Time entries and calendar feeds could reference a site from another org.
--    Bind them to the same org the way 0024 did for attendance.
-- 4. Org logos no longer accept SVG (script can ride along in SVG).
-- =====================================================================

-- 1. Function privileges -------------------------------------------------

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.sync_registration_program_choices() from public, anon, authenticated;
revoke execute on function public.limit_public_registration_burst() from public, anon, authenticated;
revoke execute on function public.limit_public_survey_burst() from public, anon, authenticated;

revoke execute on function public.is_org_member(uuid) from public, anon;
revoke execute on function public.member_role(uuid) from public, anon;
revoke execute on function public.shares_org_with(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.member_role(uuid) to authenticated;
grant execute on function public.shares_org_with(uuid) to authenticated;

-- 2. Fixed search_path ----------------------------------------------------

alter function public.set_updated_at() set search_path = public;

-- 3. Tenant-bound site references ----------------------------------------

create unique index if not exists sites_org_id_id_key on sites (org_id, id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'staff_time_entries_org_site_fkey'
  ) then
    alter table staff_time_entries
      add constraint staff_time_entries_org_site_fkey
      foreign key (org_id, site_id) references sites (org_id, id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'calendar_feeds_org_site_fkey'
  ) then
    alter table calendar_feeds
      add constraint calendar_feeds_org_site_fkey
      foreign key (org_id, site_id) references sites (org_id, id) on delete cascade;
  end if;
end $$;

-- 4. Logo uploads: raster formats only ------------------------------------

update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'org-logos';

notify pgrst, 'reload schema';
