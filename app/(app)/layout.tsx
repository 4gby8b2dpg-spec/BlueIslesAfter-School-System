import { redirect } from "next/navigation";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/app-nav";
import "./app.css";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireAppContext();
  const initials = ctx.fullName
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const orgInitials = ctx.orgName
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-logo">
          <span className="app-logo-mark">
            <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
              <path
                d="M16 3c-1.4 3.6-4 6-7.6 7.4C12 11.8 14.6 14.4 16 18c1.4-3.6 4-6.2 7.6-7.6C20 9 17.4 6.6 16 3Z"
                fill="#fff"
              />
              <circle cx="24" cy="22" r="3" fill="#f6b25a" />
            </svg>
          </span>
          BlueIsles
        </div>

        <div className="app-org-card">
          <span className="app-org-badge">{orgInitials || "OR"}</span>
          <span>
            <div className="app-org-name">{ctx.orgName}</div>
            <div className="app-org-role">{ctx.role}</div>
          </span>
        </div>

        <AppNav />

        <div className="app-side-foot">
          <div className="app-user-chip">
            <span className="app-avatar" title={ctx.email}>
              {initials || "U"}
            </span>
            <span>
              <div className="app-user-name">{ctx.fullName}</div>
              <div className="app-user-role">{ctx.role}</div>
            </span>
          </div>
          <form action={signOut}>
            <button className="app-signout" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="app-main">
        <div className="app-content">{children}</div>
      </div>
    </div>
  );
}
