import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signOut, createOrgForSelf } from "./actions";
import "../login/login.css";

// Shown to a signed-in user who has no *active* org membership yet. Two
// distinct cases, told apart by whether any membership row exists at all
// (not just active ones — requireAppContext only checks active):
//   - a row exists (e.g. status 'invited') → they belong to an org that
//     already exists and are waiting on that org's admin to activate them.
//   - no row at all → brand-new signup, offer to create their own org.
export default async function NoOrgPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // is_org_member() (and therefore the memberships RLS read policy) requires
  // status='active' — an invited-but-not-yet-active row is invisible to the
  // owning user under RLS, which would defeat this exact check. Use the
  // admin client, scoped to this user's own id (from a verified session).
  const admin = createAdminClient();
  const { count } = await admin
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const hasPendingMembership = (count ?? 0) > 0;

  return (
    <main className="login-wrap">
      <div className="login-card" style={{ textAlign: "center" }}>
        <div className="login-brand" style={{ justifyContent: "center" }}>
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
            <path
              d="M16 3c-1.4 3.6-4 6-7.6 7.4C12 11.8 14.6 14.4 16 18c1.4-3.6 4-6.2 7.6-7.6C20 9 17.4 6.6 16 3Z"
              fill="#0D9488"
            />
            <circle cx="24" cy="22" r="3" fill="#D97706" />
          </svg>
          BlueIsles
        </div>

        {hasPendingMembership ? (
          <>
            <h1>Waiting on your organization</h1>
            <p className="login-sub">
              You&rsquo;re signed in as <strong>{user.email}</strong>, but that
              organization&rsquo;s admin hasn&rsquo;t activated your account yet.
              Check back once they have.
            </p>
          </>
        ) : (
          <>
            <h1>Name your organization</h1>
            <p className="login-sub">
              You&rsquo;re signed in as <strong>{user.email}</strong>. Create your
              organization to get started — you&rsquo;ll be its first admin.
            </p>
            <form action={createOrgForSelf} style={{ textAlign: "left" }}>
              <label className="login-field">
                <span>Organization name</span>
                <input name="orgName" required placeholder="e.g. Riverside After-School" />
              </label>
              <button className="login-btn" type="submit" style={{ width: "100%", marginTop: 14 }}>
                Create organization
              </button>
            </form>
          </>
        )}

        <form action={signOut} style={{ marginTop: 18 }}>
          <button
            type="submit"
            style={{
              font: "inherit",
              fontWeight: 600,
              padding: "10px 18px",
              borderRadius: 999,
              border: "1px solid #dfe7e5",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
