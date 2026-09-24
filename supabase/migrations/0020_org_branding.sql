-- =====================================================================
-- 0020 — org branding: rename + logo upload for paying customers.
--
-- orgs got only org_self_read in 0001 ("orgs / profiles / memberships
-- need bespoke policies") — nothing could ever UPDATE it except the
-- service-role client. Admins now get a scoped update policy, mirroring
-- membership_admin's shape.
--
-- Logos live in a public storage bucket (org-logos/<org_id>/<filename>):
-- public read means the sidebar, printed certificates, and the public
-- registration page can all just <img src> the stored URL directly, no
-- signed URLs needed — a logo isn't sensitive data. Writes are still
-- locked to that org's admins, checked from the org_id folder segment.
-- =====================================================================

alter table orgs add column if not exists logo_url text;

create policy org_admin_update on orgs for update
  using (public.is_org_member(id) and public.member_role(id) = 'admin')
  with check (public.is_org_member(id) and public.member_role(id) = 'admin');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-logos', 'org-logos', true, 2097152, array['image/png','image/jpeg','image/svg+xml','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "org admins write own logo"
on storage.objects for insert
with check (
  bucket_id = 'org-logos'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
  and public.member_role(((storage.foldername(name))[1])::uuid) = 'admin'
);

create policy "org admins update own logo"
on storage.objects for update
using (
  bucket_id = 'org-logos'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
  and public.member_role(((storage.foldername(name))[1])::uuid) = 'admin'
)
with check (
  bucket_id = 'org-logos'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
  and public.member_role(((storage.foldername(name))[1])::uuid) = 'admin'
);

create policy "org admins delete own logo"
on storage.objects for delete
using (
  bucket_id = 'org-logos'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
  and public.member_role(((storage.foldername(name))[1])::uuid) = 'admin'
);
