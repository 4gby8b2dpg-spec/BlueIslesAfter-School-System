import { createAdminClient } from "@/lib/supabase/admin";

// Attach a signed-in person to every org that invited their email. Runs
// server-side with the admin client, because the person has no membership
// yet and so RLS can't see or write anything for them.
//
// ignoreDuplicates keeps an existing membership's role untouched — an invite
// never silently demotes or promotes someone who's already in the org.
export async function claimInvitesForUser(userId: string, email: string | null) {
  if (!email) return;
  const admin = createAdminClient();
  const { data: invites, error } = await admin
    .from("org_invites")
    .select("id, org_id, role")
    .eq("email", email.toLowerCase());
  if (error) {
    console.error("[invites] lookup failed:", error);
    return;
  }

  for (const invite of invites ?? []) {
    const { error: memberError } = await admin.from("memberships").upsert(
      { org_id: invite.org_id, user_id: userId, role: invite.role, status: "active" },
      { onConflict: "org_id,user_id", ignoreDuplicates: true },
    );
    if (memberError) {
      console.error("[invites] membership insert failed:", memberError);
      continue;
    }

    await admin.from("audit_log").insert({
      org_id: invite.org_id,
      actor_id: userId,
      action: "create",
      entity_table: "memberships",
      entity_id: null,
      before: null,
      after: { role: invite.role, via: "invite" },
    });
    await admin.from("org_invites").delete().eq("id", invite.id);
  }
}
