-- =====================================================================
-- 0004 — let org co-members read each other's basic profile.
-- Needed for the Settings → Users screen (list members with name + email).
-- profiles otherwise only allows self-read (0001), which would hide teammates.
-- SECURITY DEFINER helper avoids RLS recursion between profiles ↔ memberships.
-- =====================================================================

create or replace function public.shares_org_with(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from memberships m1
    join memberships m2 on m1.org_id = m2.org_id
    where m1.user_id = auth.uid()
      and m2.user_id = target
  );
$$;

-- Additive SELECT policy (permissive policies OR together with profile_self_rw).
drop policy if exists profile_org_read on profiles;
create policy profile_org_read on profiles
  for select using (public.shares_org_with(id));
