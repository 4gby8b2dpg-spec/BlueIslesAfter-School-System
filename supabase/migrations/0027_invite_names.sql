-- =====================================================================
-- 0027 - names on invites
--
-- Admins can enter a person's name when adding them. The name waits on the
-- invite and is copied onto the person's profile when they sign in (see
-- lib/invites.ts). Only a missing or auto-generated name is replaced, so a
-- name the person has set themselves is never overwritten.
-- =====================================================================

alter table org_invites add column if not exists full_name text;

alter table org_invites
  add constraint org_invites_full_name_len
  check (full_name is null or char_length(full_name) <= 120);
