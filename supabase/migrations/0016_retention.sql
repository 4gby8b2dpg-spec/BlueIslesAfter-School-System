-- =====================================================================
-- 0016 — data retention & purge policy (FR-I.4).
--
-- Nullable/off by default (retention_years null = feature disabled), same
-- convention as the other org_settings columns in 0006. Eligibility is
-- computed live in lib/retention.ts, not stored — no purge queue table,
-- matching the derived/live convention used by flags.ts and recognition.ts.
-- =====================================================================

alter table org_settings add column if not exists retention_years int;
