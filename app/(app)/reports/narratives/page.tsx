import Link from "next/link";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { PageHead } from "@/components/page-head";
import { deleteNarrative } from "./actions";
import "../reports.css";

export const dynamic = "force-dynamic";

export default async function NarrativesPage() {
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const { data } = await supabase
    .from("report_narratives")
    .select("id, title, updated_at")
    .eq("org_id", ctx.orgId)
    .order("updated_at", { ascending: false });
  const narratives = data ?? [];

  const canEdit = ["admin", "director"].includes(ctx.role);

  return (
    <main className="dash">
      <PageHead href="/reports" title="Narrative reports" tone="violet">
        Compose text, KPI callouts, and chart snapshots into a board-deck-style narrative.
      </PageHead>

      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <h2>Narratives</h2>
          </div>
          {canEdit && (
            <Link href="/reports/narratives/new" className="btn-primary">
              + New narrative
            </Link>
          )}
        </div>
        <ul className="settings-list">
          {narratives.map((n) => (
            <li key={n.id} className="settings-list-row">
              <Link href={`/reports/narratives/${n.id}`}>{n.title}</Link>
              <span className="settings-row-actions">
                <span className="in-use">{new Date(n.updated_at).toLocaleDateString()}</span>
                {canEdit && (
                  <form action={deleteNarrative}>
                    <input type="hidden" name="id" value={n.id} />
                    <button className="link-btn danger" type="submit">
                      Delete
                    </button>
                  </form>
                )}
              </span>
            </li>
          ))}
          {narratives.length === 0 && <li className="empty">No narratives yet.</li>}
        </ul>
      </section>
    </main>
  );
}
