import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { enrollParticipant, withdrawEnrollment } from "../actions";
import { getParticipantFlag, FLAG_LABEL } from "@/lib/flags";
import "../participants.css";

export const dynamic = "force-dynamic";

function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

const STATUS_DOT: Record<string, string> = {
  present: "good",
  late: "ok",
  excused: "muted",
  absent: "warn",
};

export default async function ParticipantProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const { data: p } = await supabase
    .from("participants")
    .select(
      "id, first_name, last_name, grade, school, date_of_birth, gender, photo_consent, external_id, medical_notes",
    )
    .eq("org_id", ctx.orgId)
    .eq("id", id)
    .maybeSingle();

  if (!p) notFound();

  const [enrollRes, attRes, guardiansRes, flagsRes, programsRes] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, status, enrolled_on, program_id, programs(name, category)")
      .eq("org_id", ctx.orgId)
      .eq("participant_id", id),
    supabase
      .from("attendance_records")
      .select("status, sessions(starts_at, programs(name))")
      .eq("org_id", ctx.orgId)
      .eq("participant_id", id),
    supabase
      .from("guardians_link")
      .select("relationship, guardians(first_name, last_name, phone, email, is_emergency_contact, authorized_pickup)")
      .eq("org_id", ctx.orgId)
      .eq("participant_id", id),
    getParticipantFlag(ctx.orgId, id),
    supabase.from("programs").select("id, name").eq("org_id", ctx.orgId),
  ]);

  const enrollments = (enrollRes.data ?? []) as unknown as {
    id: string;
    status: string;
    enrolled_on: string | null;
    program_id: string;
    programs: { name: string; category: string | null } | null;
  }[];
  const attendance = (attRes.data ?? []) as unknown as {
    status: string;
    sessions: { starts_at: string; programs: { name: string } | null } | null;
  }[];
  const guardians = (guardiansRes.data ?? []) as unknown as {
    relationship: string | null;
    guardians: {
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      email: string | null;
      is_emergency_contact: boolean;
      authorized_pickup: boolean;
    } | null;
  }[];
  const flag = flagsRes; // derived chronic-absence flag, or null
  const programs = programsRes.data ?? [];

  // attendance rate + recent
  let pres = 0,
    tot = 0;
  for (const a of attendance) {
    if (a.status === "present" || a.status === "late") {
      pres++;
      tot++;
    } else if (a.status === "absent") tot++;
  }
  const rate = tot > 0 ? Math.round((pres / tot) * 100) : null;
  const recent = attendance
    .filter((a) => a.sessions?.starts_at)
    .sort((x, y) => (x.sessions!.starts_at < y.sessions!.starts_at ? 1 : -1))
    .slice(0, 8);

  const activeEnrollments = enrollments.filter((e) => e.status === "enrolled");
  const enrolledIds = new Set(activeEnrollments.map((e) => e.program_id));
  const enrollable = programs.filter((pr) => !enrolledIds.has(pr.id));
  const canEdit = ["admin", "director", "staff"].includes(ctx.role);
  const age = ageFrom(p.date_of_birth);
  const rateCls = rate == null ? "muted" : rate >= 90 ? "good" : rate >= 80 ? "ok" : "warn";

  return (
    <main className="dash">
      <div className="profile-back">
        <Link href="/participants">← All participants</Link>
      </div>

      {/* header */}
      <section className="card profile-head">
        <div className="profile-avatar">
          {p.first_name[0]}
          {p.last_name[0]}
        </div>
        <div className="profile-id">
          <h1>
            {p.first_name} {p.last_name}
          </h1>
          <div className="profile-meta">
            {age != null && <span>Age {age}</span>}
            <span>Grade {p.grade ?? "—"}</span>
            <span>{p.school ?? "—"}</span>
            {p.external_id && <span>ID {p.external_id}</span>}
          </div>
        </div>
        <div className="profile-chips">
          <span className={`att-band ${rateCls} num`}>
            {rate == null ? "No attendance" : `${rate}% attendance`}
          </span>
          {flag && <span className="risk-chip">at risk</span>}
          <span className={p.photo_consent ? "consent-chip yes" : "consent-chip no"}>
            {p.photo_consent ? "photo consent" : "no photo consent"}
          </span>
        </div>
      </section>

      <div className="profile-grid">
        {/* enrollments */}
        <section className="card">
          <div className="card-head">
            <h2>Enrollments</h2>
            <span className="card-sub">{activeEnrollments.length} active</span>
          </div>
          {enrollments.length === 0 ? (
            <p className="empty">Not enrolled in any program yet.</p>
          ) : (
            <ul className="enroll-list">
              {enrollments
                .sort((a, b) => (a.status === "enrolled" ? -1 : 1))
                .map((e) => (
                  <li key={e.id} className="enroll-row">
                    <span className="enroll-name">{e.programs?.name ?? "—"}</span>
                    <span className={`enroll-status ${e.status}`}>{e.status}</span>
                    {canEdit && e.status === "enrolled" && (
                      <form action={withdrawEnrollment}>
                        <input type="hidden" name="enrollmentId" value={e.id} />
                        <input type="hidden" name="participantId" value={p.id} />
                        <button className="link-btn" type="submit">
                          Withdraw
                        </button>
                      </form>
                    )}
                  </li>
                ))}
            </ul>
          )}

          {canEdit && enrollable.length > 0 && (
            <form action={enrollParticipant} className="enroll-add">
              <input type="hidden" name="participantId" value={p.id} />
              <select name="programId" defaultValue="" required aria-label="Program to enroll in">
                <option value="" disabled>
                  Enroll in…
                </option>
                {enrollable.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                  </option>
                ))}
              </select>
              <button className="btn-primary" type="submit">
                Enroll
              </button>
            </form>
          )}
        </section>

        {/* attendance */}
        <section className="card">
          <div className="card-head">
            <h2>Attendance</h2>
            <span className="card-sub">{tot} records</span>
          </div>
          {recent.length === 0 ? (
            <p className="empty">No attendance recorded yet.</p>
          ) : (
            <ul className="att-list">
              {recent.map((a, i) => (
                <li key={i} className="att-row">
                  <span className={`att-dot ${STATUS_DOT[a.status] ?? "muted"}`} aria-hidden="true" />
                  <span className="att-when">
                    {a.sessions?.starts_at
                      ? new Date(a.sessions.starts_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </span>
                  <span className="att-prog">{a.sessions?.programs?.name ?? "—"}</span>
                  <span className="att-status">{a.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* contacts */}
        <section className="card">
          <div className="card-head">
            <h2>Contacts</h2>
          </div>
          {guardians.length === 0 ? (
            <p className="empty">No guardians on file.</p>
          ) : (
            <ul className="guardian-list">
              {guardians.map((g, i) => (
                <li key={i} className="guardian-row">
                  <span className="guardian-name">
                    {g.guardians?.first_name} {g.guardians?.last_name}
                    {g.relationship ? ` · ${g.relationship}` : ""}
                  </span>
                  <span className="guardian-contact">
                    {g.guardians?.phone ?? g.guardians?.email ?? "—"}
                  </span>
                  {g.guardians?.authorized_pickup && (
                    <span className="pickup-chip">pickup</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* flags */}
        <section className="card">
          <div className="card-head">
            <h2>Flags</h2>
          </div>
          {!flag ? (
            <p className="empty good">No open flags.</p>
          ) : (
            <ul className="flag-list">
              <li className={`flag-row ${flag.severity}`}>
                {FLAG_LABEL[flag.type]} — {flag.detail}
              </li>
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
