import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { ImportWizard, type ExistingParticipant } from "@/components/import-wizard";
import { RollbackButton } from "@/components/rollback-button";
import { rollbackImport } from "./actions";
import "./import.css";
import { PageHead } from "@/components/page-head";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const [{ data: existing }, { data: history }] = await Promise.all([
    supabase
      .from("participants")
      .select("external_id, first_name, last_name, date_of_birth")
      .eq("org_id", ctx.orgId),
    supabase
      .from("imports")
      .select(
        "id, file_name, target_type, status, rows_committed, rows_skipped, rows_errored, created_at, ranBy:run_by(full_name)",
      )
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  type HistoryRow = {
    id: string;
    file_name: string;
    target_type: string;
    status: string;
    rows_committed: number;
    rows_skipped: number | null;
    rows_errored: number | null;
    created_at: string;
    ranBy: { full_name: string | null } | { full_name: string | null }[] | null;
  };
  const historyRows = (history ?? []) as HistoryRow[];
  const ranByName = (r: HistoryRow) => {
    const p = Array.isArray(r.ranBy) ? r.ranBy[0] : r.ranBy;
    return p?.full_name || "—";
  };

  const existingParticipants: ExistingParticipant[] = (existing ?? []).map((p) => ({
    externalId: p.external_id,
    first: p.first_name,
    last: p.last_name,
    dob: p.date_of_birth,
  }));

  async function doRollback(formData: FormData) {
    "use server";
    await rollbackImport(String(formData.get("id")));
  }

  const canRollback = ctx.role === "admin" || ctx.role === "director";

  return (
    <main className="dash">
      <PageHead href="/import" title="Data Import" tone="mint">
        Drop your spreadsheets in. Map columns, catch problems, then commit.
      </PageHead>

      <ImportWizard existing={existingParticipants} />

      <section className="card">
        <div className="card-head">
          <h2>Import history</h2>
          <span className="card-sub">Last 20</span>
        </div>
        {historyRows.length === 0 ? (
          <p className="empty">No imports yet.</p>
        ) : (
          <div className="history-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Ran by</th>
                <th>Date</th>
                <th className="right">Committed</th>
                <th className="right">Skipped / errored</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((im) => (
                <tr key={im.id}>
                  <td>{im.file_name}</td>
                  <td>{im.target_type}</td>
                  <td>{ranByName(im)}</td>
                  <td>{fmtDate(im.created_at)}</td>
                  <td className="right num">{im.rows_committed}</td>
                  <td className="right num">
                    {(im.rows_skipped ?? 0)} / {(im.rows_errored ?? 0)}
                  </td>
                  <td>
                    <span className={`status ${im.status}`}>{im.status.replace("_", " ")}</span>
                  </td>
                  <td className="right">
                    {canRollback && im.status === "committed" ? (
                      <RollbackButton
                        action={doRollback}
                        importId={im.id}
                        fileName={im.file_name}
                        count={im.rows_committed}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </main>
  );
}
