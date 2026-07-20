-- =====================================================================
-- 0010 — allow "Send now" to record its delivery.
--
-- 0009 gave report_deliveries a read policy only, on the assumption that
-- rows would always be written by the cron under the service role (which
-- bypasses RLS). But the manual "Send now" button deliberately runs under
-- the caller's own session, so that testing a schedule needs no service-role
-- key — and RLS silently rejected those inserts, leaving no delivery record.
--
-- Admins and directors (the same roles that can manage schedules) may now
-- insert a delivery row for their own org.
-- =====================================================================

drop policy if exists report_deliveries_insert on report_deliveries;
create policy report_deliveries_insert on report_deliveries
  for insert
  with check (
    public.is_org_member(org_id)
    and public.member_role(org_id) in ('admin', 'director')
  );

notify pgrst, 'reload schema';
