-- =====================================================================
-- 0015 — make audit_log append-only.
--
-- 0001 gave every org-scoped table the same org_write policy, audit_log
-- included. That let any admin/director/staff member UPDATE or DELETE
-- audit rows — which defeats the point of an audit trail: the people
-- most likely to want a record altered are exactly the ones who had
-- permission to alter it. 0001 flagged this as a follow-up; this is it.
--
-- After this migration the only write an app user can perform is INSERT.
-- Reads are unchanged (any active member of the org, as before).
--
-- Retention and erasure requests are unaffected: those run through the
-- service-role client in lib/supabase/admin.ts, which bypasses RLS.
--
-- Verified against the app before writing: every audit_log call site is
-- an .insert() or a .select() — no code path updates or deletes.
-- =====================================================================

-- The blanket for-all policy from the 0001 loop.
drop policy if exists org_write on audit_log;

-- Insert only. No update or delete policy exists, and RLS denies by
-- default, so both are now refused for every non-service-role caller.
create policy audit_append on audit_log for insert
  with check (
    public.is_org_member(org_id)
    and public.member_role(org_id) in ('admin', 'director', 'staff')
  );

-- Belt and braces: FORCE applies RLS to the table owner too, so a future
-- SECURITY DEFINER function running as the owner cannot quietly rewrite
-- history either. The service-role key still bypasses this by design.
alter table audit_log force row level security;
