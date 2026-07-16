import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Shown to a signed-in user who has no active org membership yet.
export default async function NoOrgPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#f4f7f6",
        color: "#14201f",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 460 }}>
        <h1 style={{ fontSize: 26, marginBottom: 10 }}>No organization yet</h1>
        <p style={{ color: "#47595a", lineHeight: 1.5 }}>
          You&rsquo;re signed in as <strong>{user.email}</strong>, but this account
          isn&rsquo;t attached to an organization. Once an admin adds you (or the
          demo seed runs), your dashboard will appear here.
        </p>
        <form action={signOut} style={{ marginTop: 22 }}>
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
