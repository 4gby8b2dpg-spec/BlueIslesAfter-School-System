import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AppContext = {
  userId: string;
  email: string;
  orgId: string;
  orgName: string;
  orgLogoUrl: string | null;
  role: "admin" | "director" | "staff" | "viewer";
  fullName: string;
};

async function getStoredOrgLogoUrl(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
) {
  const { data: files } = await admin.storage.from("org-logos").list(orgId);
  const file = files?.find((item) => item.name.startsWith("logo."));
  if (!file) return null;
  return admin.storage.from("org-logos").getPublicUrl(`${orgId}/${file.name}`).data.publicUrl;
}

/**
 * Resolves the signed-in user and their active org membership.
 * Redirects to /login if not authenticated, or to /no-org if the user has
 * no active membership yet (e.g. invited but not seeded).
 */
/**
 * Non-redirecting variant for route handlers / APIs. Returns null when the
 * caller isn't a signed-in, active org member (so the endpoint can answer with
 * a proper 401/403 instead of an HTML redirect the offline queue can't read).
 */
export async function getAppContext(): Promise<AppContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: initialMembership, error: membershipError } = await admin
    .from("memberships")
    .select("org_id, role, orgs(name, logo_url), profiles(full_name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  let membership = initialMembership;
  if (membershipError) {
    ({ data: membership } = await admin
      .from("memberships")
      .select("org_id, role, orgs(name), profiles(full_name)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle());
  }
  if (!membership) return null;

  const org = membership.orgs as unknown as
    | { name: string; logo_url?: string | null }
    | { name: string; logo_url?: string | null }[];
  const profile = membership.profiles as unknown as
    | { full_name: string }
    | { full_name: string }[]
    | null;
  const orgName = Array.isArray(org) ? org[0]?.name : org?.name;
  const orgLogoUrl =
    (Array.isArray(org) ? org[0]?.logo_url : org?.logo_url) ??
    (await getStoredOrgLogoUrl(admin, membership.org_id as string));
  const fullName = Array.isArray(profile) ? profile[0]?.full_name : profile?.full_name;

  return {
    userId: user.id,
    email: user.email ?? "",
    orgId: membership.org_id as string,
    orgName: orgName ?? "Your organization",
    orgLogoUrl: orgLogoUrl ?? null,
    role: membership.role as AppContext["role"],
    fullName: fullName ?? user.email ?? "",
  };
}

export async function requireAppContext(): Promise<AppContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: initialMembership, error: membershipError } = await admin
    .from("memberships")
    .select("org_id, role, orgs(name, logo_url), profiles(full_name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  let membership = initialMembership;
  if (membershipError) {
    ({ data: membership } = await admin
      .from("memberships")
      .select("org_id, role, orgs(name), profiles(full_name)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle());
  }

  if (!membership) redirect("/no-org");

  // Supabase returns embedded relations as objects (or arrays); normalize.
  const org = membership.orgs as unknown as
    | { name: string; logo_url?: string | null }
    | { name: string; logo_url?: string | null }[];
  const profile = membership.profiles as unknown as
    | { full_name: string }
    | { full_name: string }[]
    | null;
  const orgName = Array.isArray(org) ? org[0]?.name : org?.name;
  const orgLogoUrl =
    (Array.isArray(org) ? org[0]?.logo_url : org?.logo_url) ??
    (await getStoredOrgLogoUrl(admin, membership.org_id as string));
  const fullName = Array.isArray(profile)
    ? profile[0]?.full_name
    : profile?.full_name;

  return {
    userId: user.id,
    email: user.email ?? "",
    orgId: membership.org_id as string,
    orgName: orgName ?? "Your organization",
    orgLogoUrl: orgLogoUrl ?? null,
    role: membership.role as AppContext["role"],
    fullName: fullName ?? user.email ?? "",
  };
}
