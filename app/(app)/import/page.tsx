import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import {
  ImportWizard,
  type ExistingParticipant,
  type SiteOption,
} from "@/components/import-wizard";
import { rollbackImport } from "./actions";
import "./import.css";
import { PageHead } from "@/components/page-head";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const [{ data: existing }, { data: programs }, { data: siteRows }, { data: history }] =
    await Promise.all([
      supabase
        .from("participants")
        .select("external_id, first_name, last_name, date_of_birth")
        .eq("org_id", ctx.orgId),
      supabase.from("programs").select("name").eq("org_id", ctx.orgId),
      supabase.from("sites").select("id, name").eq("org_id", ctx.orgId).order("name"),
      supabase
        .from("imports")
        .select("id, file_name, target_type, status, rows_committed, created_at")
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const existingParticipants: ExistingParticipant[] = (existing ?? []).map((p) => ({
    externalId: p.external_id,
    first: p.first_name,
    last: p.last_name,
    dob: p.date_of_birth,
  }));

  const existingPrograms: string[] = (programs ?? []).map((p) => p.name as string);
  const sites: SiteOption[] = (siteRows ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
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

      <ImportWizard
        existing={existingParticipants}
        existingPrograms={existingPrograms}
        sites={sites}
      />

      <section className="card">
        <div className="card-head">
          <h2>Import history</h2>
          <span className="card-sub">Last 10</span>
        </div>
        {(history ?? []).length === 0 ? (
          <p className="empty">No imports yet.</p>
        ) : (
          <table className="history-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Status</th>
                <th className="right">Rows</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(history ?? []).map((im) => (
                <tr key={im.id}>
                  <td>{im.file_name}</td>
                  <td>{im.target_type}</td>
                  <td>
                    <span className={`status ${im.status}`}>{im.status}</span>
                  </td>
                  <td className="right num">{im.rows_committed}</td>
                  <td className="right">
                    {canRollback && im.status === "committed" ? (
                      <form action={doRollback}>
                        <input type="hidden" name="id" value={im.id} />
                        <button className="link-btn" type="submit">
                          Roll back
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
