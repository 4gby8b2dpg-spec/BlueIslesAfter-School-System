-- =====================================================================
-- 0012 — staff review of parent registrations.
--
-- No new tables: the pending queue (registrations) and its RLS already
-- shipped in 0011. Approving a submission creates real participant /
-- guardian / enrollment rows under the reviewing staff member's own RLS
-- session (admin/director/staff org_write on those tables from 0001), so
-- no SECURITY DEFINER function and no service-role key are involved.
--
-- The only schema change here is a new enrollment_source label so seats
-- created from a parent submission are traceable back to that origin,
-- distinct from 'manual' (staff added) and 'import' (bulk upload).
-- =====================================================================

alter type enrollment_source add value if not exists 'registration';

-- Verification (avoids the "Success. No rows returned" ambiguity): the new
-- label should appear alongside the originals.
select enumlabel
from pg_enum
where enumtypid = 'enrollment_source'::regtype
order by enumsortorder;
