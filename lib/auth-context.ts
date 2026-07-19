import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppContext = {
  userId: string;
  email: string;
  orgId: string;
  orgName: string;
  role: "admin" | "director" | "staff" | "viewer";
  fullName: string;
};

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

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id, role, orgs(name), profiles(full_name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const org = membership.orgs as unknown as { name: string } | { name: string }[];
  const profile = membership.profiles as unknown as
    | { full_name: string }
    | { full_name: string }[]
    | null;
  const orgName = Array.isArray(org) ? org[0]?.name : org?.name;
  const fullName = Array.isArray(profile) ? profile[0]?.full_name : profile?.full_name;

  return {
    userId: user.id,
    email: user.email ?? "",
    orgId: membership.org_id as string,
    orgName: orgName ?? "Your organization",
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

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id, role, orgs(name), profiles(full_name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/no-org");

  // Supabase returns embedded relations as objects (or arrays); normalize.
  const org = membership.orgs as unknown as { name: string } | { name: string }[];
  const profile = membership.profiles as unknown as
    | { full_name: string }
    | { full_name: string }[]
    | null;
  const orgName = Array.isArray(org) ? org[0]?.name : org?.name;
  const fullName = Array.isArray(profile)
    ? profile[0]?.full_name
    : profile?.full_name;

  return {
    userId: user.id,
    email: user.email ?? "",
    orgId: membership.org_id as string,
    orgName: orgName ?? "Your organization",
    role: membership.role as AppContext["role"],
    fullName: fullName ?? user.email ?? "",
  };
}
