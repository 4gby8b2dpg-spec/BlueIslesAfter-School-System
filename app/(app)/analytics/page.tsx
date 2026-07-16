import Link from "next/link";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const METRICS = [
  { key: "enrolled", label: "Enrolled participants", unit: "count" },
  { key: "attendance_rate", label: "Attendance rate", unit: "percent" },
  { key: "sessions_held", label: "Sessions held", unit: "count" },
] as const;

const DIMS = [
  { key: "program", label: "By program" },
  { key: "site", label: "By site" },
  { key: "grade", label: "By grade" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];
type DimKey = (typeof DIMS)[number]["key"];

// sessions aren't attached to a grade
const UNSUPPORTED = new Set(["sessions_held:grade"]);

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ metric?: string; by?: string }>;
}) {
  const ctx = await requireAppContext();
  const sp = await searchParams;

  const metric: MetricKey = METRICS.some((m) => m.key === sp.metric)
    ? (sp.metric as MetricKey)
    : "enrolled";
  const by: DimKey = DIMS.some((d) => d.key === sp.by)
    ? (sp.by as DimKey)
    : "program";
  const metricDef = METRICS.find((m) => m.key === metric)!;
  const unsupported = UNSUPPORTED.has(`${metric}:${by}`);

  const supabase = await createClient();
  const [programsRes, sitesRes, participantsRes, enrollRes, sessionsRes, attRes] =
    await Promise.all([
      supabase.from("programs").select("id, name, site_id").eq("org_id", ctx.orgId),
      supabase.from("sites").select("id, name").eq("org_id", ctx.orgId),
      supabase.from("participants").select("id, grade").eq("org_id", ctx.orgId),
      supabase.from("enrollments").select("participant_id, program_id, status").eq("org_id", ctx.orgId),
      supabase.from("sessions").select("id, program_id, status").eq("org_id", ctx.orgId),
      supabase
        .from("attendance_records")
        .select("status, participant_id, sessions(program_id)")
        .eq("org_id", ctx.orgId),
    ]);

  const programs = programsRes.data ?? [];
  const sites = sitesRes.data ?? [];
  const participants = participantsRes.data ?? [];
  const enrollments = enrollRes.data ?? [];
  const sessions = sessionsRes.data ?? [];
  const attendance = (attRes.data ?? []) as unknown as {
    status: string;
    participant_id: string;
    sessions: { program_id: string } | null;
  }[];

  const progById = new Map(programs.map((p) => [p.id, p]));
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const gradeById = new Map(participants.map((p) => [p.id, p.grade ?? "—"]));

  // resolve a grouping key for a given program/participant under the chosen dimension
  function keyForProgram(programId: string | undefined | null): string | null {
    if (by === "program") return programId ? progById.get(programId)?.name ?? null : null;
    if (by === "site") {
      const p = programId ? progById.get(programId) : undefined;
      return p?.site_id ? siteName.get(p.site_id) ?? "Unassigned" : "Unassigned";
    }
    return null; // grade handled per-participant
  }
  function keyForParticipant(participantId: string): string | null {
    if (by === "grade") return `Grade ${gradeById.get(participantId) ?? "—"}`;
    return null;
  }

  // ---- compute rows ----
  type Row = { label: string; value: number; display: string };
  let rows: Row[] = [];

  if (!unsupported && metric === "enrolled") {
    const acc = new Map<string, number>();
    for (const e of enrollments) {
      if (e.status !== "enrolled") continue;
      const k =
        by === "grade" ? keyForParticipant(e.participant_id) : keyForProgram(e.program_id);
      if (!k) continue;
      acc.set(k, (acc.get(k) ?? 0) + 1);
    }
    rows = [...acc].map(([label, v]) => ({ label, value: v, display: String(v) }));
  } else if (!unsupported && metric === "sessions_held") {
    const acc = new Map<string, number>();
    for (const s of sessions) {
      if (s.status !== "completed") continue;
      const k = keyForProgram(s.program_id);
      if (!k) continue;
      acc.set(k, (acc.get(k) ?? 0) + 1);
    }
    rows = [...acc].map(([label, v]) => ({ label, value: v, display: String(v) }));
  } else if (!unsupported && metric === "attendance_rate") {
    const acc = new Map<string, { pres: number; tot: number }>();
    for (const a of attendance) {
      const k =
        by === "grade"
          ? keyForParticipant(a.participant_id)
          : keyForProgram(a.sessions?.program_id);
      if (!k) continue;
      const cur = acc.get(k) ?? { pres: 0, tot: 0 };
      if (a.status === "present" || a.status === "late") {
        cur.pres++;
        cur.tot++;
      } else if (a.status === "absent") cur.tot++;
      acc.set(k, cur);
    }
    rows = [...acc].map(([label, v]) => {
      const rate = v.tot > 0 ? Math.round((v.pres / v.tot) * 100) : 0;
      return { label, value: rate, display: `${rate}%` };
    });
  }

  rows.sort((a, b) => b.value - a.value);
  const maxVal = Math.max(1, ...rows.map((r) => r.value));

  const linkFor = (m: MetricKey, d: DimKey) => `/analytics?metric=${m}&by=${d}`;

  return (
    <main className="dash">
      <div className="dash-head">
        <h1>Analytics Explorer</h1>
        <p>Slice a metric by a dimension — the numbers behind the dashboard.</p>
      </div>

      {/* metric + dimension selectors */}
      <section className="card">
        <div className="explorer-controls">
          <div className="seg-group">
            <span className="seg-label">Metric</span>
            <div className="seg">
              {METRICS.map((m) => (
                <Link
                  key={m.key}
                  href={linkFor(m.key, by)}
                  className={m.key === metric ? "seg-item active" : "seg-item"}
                >
                  {m.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="seg-group">
            <span className="seg-label">Group</span>
            <div className="seg">
              {DIMS.map((d) => (
                <Link
                  key={d.key}
                  href={linkFor(metric, d.key)}
                  className={d.key === by ? "seg-item active" : "seg-item"}
                >
                  {d.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* result */}
      <section className="card">
        <div className="card-head">
          <h2>
            {metricDef.label} · {DIMS.find((d) => d.key === by)!.label.toLowerCase()}
          </h2>
        </div>

        {unsupported ? (
          <p className="empty">
            Sessions aren&rsquo;t tied to a grade, so this combination has no data.
            Try grouping by program or site.
          </p>
        ) : rows.length === 0 ? (
          <p className="empty">No data for this combination yet.</p>
        ) : (
          <>
            <ul className="bars">
              {rows.map((r, i) => (
                <li key={i} className="bar-row">
                  <span className="bar-name">{r.label}</span>
                  <span className="bar-track">
                    <span
                      className="bar-fill"
                      style={{ width: `${(r.value / maxVal) * 100}%` }}
                    />
                  </span>
                  <span className="bar-val num">{r.display}</span>
                </li>
              ))}
            </ul>

            <table className="explorer-table">
              <thead>
                <tr>
                  <th>{DIMS.find((d) => d.key === by)!.label.replace("By ", "")}</th>
                  <th className="right">{metricDef.label}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.label}</td>
                    <td className="right num">{r.display}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <p className="explorer-foot">
        Reading live data through RLS. AI &ldquo;ask your data&rdquo; and proactive
        briefings will build on this same query layer (schema is already in place).
      </p>
    </main>
  );
}
