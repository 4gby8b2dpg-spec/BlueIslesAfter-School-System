-- =====================================================================
-- 0019 — drop participants.medical_notes.
--
-- It's been a plaintext free-text column marked "encrypt in prod" since
-- 0001, but no feature ever wrote to it: no input form, no CSV-import
-- mapping, no seed data. Rather than build encryption for a field nothing
-- can populate, drop it — a real medical-notes feature, if one is built
-- later, should be designed with encryption from the start rather than
-- retrofitted onto this column.
-- =====================================================================

alter table participants drop column if exists medical_notes;
