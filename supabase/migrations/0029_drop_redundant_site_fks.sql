-- =====================================================================
-- 0029 - drop single-column site foreign keys made redundant by 0028
--
-- 0028 added composite keys (org_id, site_id) -> sites (org_id, id), which
-- already guarantee a site exists and belongs to the same org. The original
-- single-column keys on site_id stayed in place, and PostgREST then could not
-- tell which relationship to use when the Timesheet embeds sites. That broke
-- clock-out and the admin "On the clock now" panel. Dropping the redundant
-- keys fixes the embed; no integrity is lost.
-- =====================================================================

alter table staff_time_entries drop constraint if exists staff_time_entries_site_id_fkey;
alter table calendar_feeds drop constraint if exists calendar_feeds_site_id_fkey;

notify pgrst, 'reload schema';
