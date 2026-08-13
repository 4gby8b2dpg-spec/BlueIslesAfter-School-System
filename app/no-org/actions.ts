"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Creates a brand-new org and makes the caller its first (and only) admin.
 * Only reachable by a signed-in user with zero membership rows — someone
 * already invited into an existing org (any status, including 'invited')
 * must not be able to spin up a second, unrelated org here.
 */
export async function createOrgForSelf(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("orgName") ?? "").trim().slice(0, 120);
  if (!name) return;

  const admin = createAdminClient();

  // Re-check server-side — don't trust that reaching this action implies no
  // membership exists, same defensive-recompute style as runRetentionPurge.
  // Admin client, not RLS: is_org_member() (and the memberships read policy)
  // requires status='active', so an invited-but-inactive row would otherwise
  // be invisible to this exact check.
  const { count } = await admin
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (count && count > 0) return;

  const { data: org, error: orgError } = await admin
    .from("orgs")
    .insert({ name })
    .select("id")
    .single();
  if (orgError || !org) return;

  const { error: membershipError } = await admin.from("memberships").insert({
    org_id: org.id,
    user_id: user.id,
    role: "admin",
    status: "active",
  });
  if (membershipError) return;

  // Membership now exists, so the regular RLS client can write the audit log.
  await supabase.from("audit_log").insert({
    org_id: org.id,
    actor_id: user.id,
    action: "create",
    entity_table: "orgs",
    entity_id: org.id,
    before: null,
    after: { name },
  });

  redirect("/dashboard");
}
