import { requireAppContext } from "@/lib/auth-context";
import { PageHead } from "@/components/page-head";
import { needsName, MAX_NAME_LENGTH } from "@/lib/names";
import { updateOwnName } from "./actions";
import "../settings/settings.css";

const MESSAGES: Record<string, { tone: "good" | "bad"; text: string }> = {
  ok: { tone: "good", text: "Your name is saved." },
  invalid: { tone: "bad", text: "Please enter your name." },
  failed: { tone: "bad", text: "Couldn't save your name. Please try again." },
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const ctx = await requireAppContext();
  const { saved } = await searchParams;
  const current = needsName(ctx.fullName, ctx.email) ? "" : ctx.fullName;
  const message = saved ? MESSAGES[saved] : undefined;

  return (
    <main className="dash">
      <PageHead href="/account" title="Your name" tone="teal">
        This is how your name appears to others in your organization.
      </PageHead>
      <section className="card" style={{ maxWidth: 480 }}>
        {message && (
          <p
            role="status"
            className="settings-note"
            style={{ color: message.tone === "good" ? "var(--good)" : "var(--crit)", fontWeight: 600 }}
          >
            {message.text}
          </p>
        )}
        <form action={updateOwnName} style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Full name</span>
            <input
              name="name"
              required
              maxLength={MAX_NAME_LENGTH}
              defaultValue={current}
              placeholder="e.g. Jane Smith"
              style={{ font: "inherit", padding: 10, borderRadius: 10, border: "1px solid #dfe7e5" }}
            />
          </label>
          <p className="settings-muted">Signed in as {ctx.email}</p>
          <div>
            <button className="btn-primary" type="submit">
              Save name
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
