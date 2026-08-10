import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { PageHead } from "@/components/page-head";
import { approveRegistration, rejectRegistration } from "./actions";
import "../participants/participants.css";
import "./registrations.css";

export const dynamic = "force-dynamic";

type Registration = {
  id: string;
  program_name: string | null;
  program_id: string | null;
  child_first: string;
  child_last: string;
  child_dob: string | null;
  child_grade: string | null;
  child_school: string | null;
  guardian_first: string | null;
  guardian_last: string | null;
  guardian_phone: string | null;
  guardian_email: string | null;
  guardian_relationship: string | null;
  photo_consent: boolean;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  reviewed_at: string | null;
  created_at: string;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function guardianName(r: Registration) {
  const n = [r.guardian_first, r.guardian_last].filter(Boolean).join(" ").trim();
  return n || "—";
}

export default async function RegistrationsPage() {
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const [{ data: regsData }, { data: peopleData }] = await Promise.all([
    supabase
      .from("registrations")
      .select(
        "id, program_name, program_id, child_first, child_last, child_dob, child_grade, child_school, guardian_first, guardian_last, guardian_phone, guardian_email, guardian_relationship, photo_consent, note, status, reviewed_at, created_at",
      )
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false }),
    // Names of existing participants, to flag likely duplicates before approval.
    supabase
      .from("participants")
      .select("first_name, last_name")
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null),
  ]);

  const regs = (regsData ?? []) as Registration[];
  const existing = new Set(
    (peopleData ?? []).map(
      (p) => `${(p.first_name ?? "").toLowerCase().trim()}|${(p.last_name ?? "").toLowerCase().trim()}`,
    ),
  );
  const isDup = (r: Registration) =>
    existing.has(`${r.child_first.toLowerCase().trim()}|${r.child_last.toLowerCase().trim()}`);

  const pending = regs.filter((r) => r.status === "pending");
  const processed = regs.filter((r) => r.status !== "pending").slice(0, 20);
  const canReview = ["admin", "director", "staff"].includes(ctx.role);

  return (
    <main className="dash">
      <PageHead href="/registrations" title="Registrations" tone="violet">
        Parent-submitted registrations waiting for review. Approving creates the participant,
        guardian, and enrollment — waitlisting automatically if the program is full.
      </PageHead>

      <div className="recog-stats">
        <div className="recog-stat">
          <span className="recog-stat-val num">{pending.length}</span>
          <span className="recog-stat-lbl">awaiting review</span>
        </div>
        <div className="recog-stat">
          <span className="recog-stat-val num">
            {regs.filter((r) => r.status === "approved").length}
          </span>
          <span className="recog-stat-lbl">approved</span>
        </div>
        <div className="recog-stat">
          <span className="recog-stat-val num">
            {regs.filter((r) => r.status === "rejected").length}
          </span>
          <span className="recog-stat-lbl">rejected</span>
        </div>
      </div>

      {pending.length === 0 ? (
        <section className="card">
          <p className="empty">
            No registrations waiting. New parent submissions from your registration link will
            appear here for approval.
          </p>
        </section>
      ) : (
        <div className="reg-queue">
          {pending.map((r) => (
            <section key={r.id} className="card reg-card">
              <div className="reg-card-head">
                <div>
                  <h3 className="reg-name">
                    {r.child_first} {r.child_last}
                    {isDup(r) && (
                      <span className="reg-dup" title="A participant with this name already exists">
                        possible duplicate
                      </span>
                    )}
                  </h3>
                  <p className="reg-sub">
                    {r.program_name ? r.program_name : "No program chosen"} · submitted{" "}
                    {fmtDate(r.created_at)}
                  </p>
                </div>
              </div>

              <dl className="reg-details">
                <div>
                  <dt>Date of birth</dt>
                  <dd>{fmtDate(r.child_dob)}</dd>
                </div>
                <div>
                  <dt>Grade</dt>
                  <dd>{r.child_grade || "—"}</dd>
                </div>
                <div>
                  <dt>School</dt>
                  <dd>{r.child_school || "—"}</dd>
                </div>
                <div>
                  <dt>Guardian</dt>
                  <dd>
                    {guardianName(r)}
                    {r.guardian_relationship ? ` (${r.guardian_relationship})` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{r.guardian_phone || "—"}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{r.guardian_email || "—"}</dd>
                </div>
                <div>
                  <dt>Photo consent</dt>
                  <dd>{r.photo_consent ? "Yes" : "No"}</dd>
                </div>
              </dl>

              {r.note && <p className="reg-note">“{r.note}”</p>}

              {canReview && (
                <div className="reg-actions">
                  <form action={approveRegistration}>
                    <input type="hidden" name="registrationId" value={r.id} />
                    <button className="reg-approve" type="submit">
                      Approve &amp; enroll
                    </button>
                  </form>
                  <form action={rejectRegistration} className="reg-reject-form">
                    <input type="hidden" name="registrationId" value={r.id} />
                    <input
                      name="reviewNote"
                      className="reg-reject-note"
                      placeholder="Reason (optional)"
                      maxLength={500}
                    />
                    <button className="reg-reject" type="submit">
                      Reject
                    </button>
                  </form>
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {processed.length > 0 && (
        <section className="card reg-processed">
          <div className="card-head">
            <h2 className="card-title">Recently processed</h2>
            <span className="card-sub">{processed.length} shown</span>
          </div>
          <table className="reg-table">
            <thead>
              <tr>
                <th>Child</th>
                <th>Program</th>
                <th>Status</th>
                <th>Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {processed.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.child_first} {r.child_last}
                  </td>
                  <td>{r.program_name || "—"}</td>
                  <td>
                    <span className={`reg-status reg-status-${r.status}`}>{r.status}</span>
                  </td>
                  <td>{fmtDate(r.reviewed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
