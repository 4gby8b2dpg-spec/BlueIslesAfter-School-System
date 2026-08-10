import Link from "next/link";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { METRIC_DEFINITIONS } from "@/lib/metrics";
import { ExplorerExport } from "@/components/explorer-export";
import { PageHead } from "@/components/page-head";
import "./compare.css";

export const dynamic = "force-dynamic";

const TYPES = [
  { key: "program", label: "Programs" },
  { key: "site", label: "Sites" },
  { key: "term", label: "Terms" },
] as const;
type TypeKey = (typeof TYPES)[number]["key"];

// The five canonical metrics, in display order. `unit` drives delta formatting.
const METRICS = [
  { key: "enrolled", label: "Enrolled participants", unit: "count", canon: null },
  { key: "attendance_rate", label: "Attendance rate", unit: "percent", canon: "attendance_rate" },
  { key: "unduplicated", label: "Unduplicated participants", unit: "count", canon: "unduplicated_participants" },
  { key: "sessions_held", label: "Sessions held", unit: "count", canon: null },
  { key: "avg_daily", label: "Avg daily attendance", unit: "count", canon: "avg_daily_attendance" },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
const attended = (s: string) => s === "present" || s === "late";

type Session = { id: string; program_id: string; status: string; starts_at: string };
type Attendance = { session_id: string; participant_id: string; status: string };
type Enrollment = { participant_id: string; program_id: string; status: string };

// Every metric for one cohort, given the program ids it spans and the data
// already filtered to the date window. Same math as the Explorer, so a
// single-program cohort matches what the Explorer shows for that program.
function cohortMetrics(
  programIds: Set<string>,
  data: { sessions: Session[]; attendance: Attendance[]; enrollments: Enrollment[]; sessionProgram: Map<string, string> },
): Record<MetricKey, number | null> {
  const inCohort = (sessionId: string) => {
    const pid = data.sessionProgram.get(sessionId);
    return pid ? programIds.has(pid) : false;
  };

  const enrolledSet = new Set<string>();
  for (const e of data.enrollments)
    if (e.status === "enrolled" && programIds.has(e.program_id)) enrolledSet.add(e.participant_id);

  let sessionsHeld = 0;
  for (const s of data.sessions)
    if (s.status === "completed" && programIds.has(s.program_id)) sessionsHeld++;

  let pres = 0;
  let tot = 0;
  const uniq = new Set<string>();
  const perSession = new Map<string, number>();
  for (const a of data.attendance) {
    if (!inCohort(a.session_id)) continue;
    if (attended(a.status)) {
      pres++;
      tot++;
      uniq.add(a.participant_id);
      perSession.set(a.session_id, (perSession.get(a.session_id) ?? 0) + 1);
    } else if (a.status === "absent") {
      tot++;
    }
  }

  let dailySum = 0;
  let dailyN = 0;
  for (const s of data.sessions) {
    if (s.status !== "completed" || !programIds.has(s.program_id)) continue;
    dailySum += perSession.get(s.id) ?? 0;
    dailyN++;
  }

  return {
    enrolled: enrolledSet.size,
    attendance_rate: tot > 0 ? Math.round((pres / tot) * 100) : null,
    unduplicated: uniq.size,
    sessions_held: sessionsHeld,
    avg_daily: dailyN > 0 ? Math.round((dailySum / dailyN) * 10) / 10 : null,
  };
}

function fmt(v: number | null, unit: string) {
  if (v == null) return "—";
  return unit === "percent" ? `${v}%` : String(v);
}

// Signed delta B − A, formatted; percent metrics read in points (pp).
function fmtDelta(a: number | null, b: number | null, unit: string) {
  if (a == null || b == null) return "—";
  const d = Math.round((b - a) * 10) / 10;
  const sign = d > 0 ? "+" : "";
  return unit === "percent" ? `${sign}${d} pp` : `${sign}${d}`;
}
function deltaClass(a: number | null, b: number | null) {
  if (a == null || b == null || a === b) return "cmp-flat";
  return b > a ? "cmp-up" : "cmp-down";
}

export default async function CohortComparePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; a?: string; b?: string; from?: string; to?: string }>;
}) {
  const ctx = await requireAppContext();
  const sp = await searchParams;

  const type: TypeKey = TYPES.some((t) => t.key === sp.type) ? (sp.type as TypeKey) : "program";

  const now = new Date();
  const from = sp.from || iso(new Date(now.getTime() - 60 * 86_400_000));
  const to = sp.to || iso(now);
  const fromTs = new Date(`${from}T00:00:00`).toISOString();
  const toTs = new Date(`${to}T23:59:59`).toISOString();

  const supabase = await createClient();
  const [programsRes, sitesRes, termsRes, enrollRes, sessionsRes] = await Promise.all([
    supabase.from("programs").select("id, name, site_id, term_id").eq("org_id", ctx.orgId),
    supabase.from("sites").select("id, name").eq("org_id", ctx.orgId),
    supabase.from("terms").select("id, name").eq("org_id", ctx.orgId),
    supabase.from("enrollments").select("participant_id, program_id, status").eq("org_id", ctx.orgId),
    supabase
      .from("sessions")
      .select("id, program_id, status, starts_at")
      .eq("org_id", ctx.orgId)
      .gte("starts_at", fromTs)
      .lte("starts_at", toTs),
  ]);

  const programs = (programsRes.data ?? []) as { id: string; name: string; site_id: string | null; term_id: string | null }[];
  const sites = (sitesRes.data ?? []) as { id: string; name: string }[];
  const terms = (termsRes.data ?? []) as { id: string; name: string }[];
  const enrollments = (enrollRes.data ?? []) as Enrollment[];
  const sessions = (sessionsRes.data ?? []) as Session[];

  const sessionIds = sessions.map((s) => s.id);
  const sessionProgram = new Map(sessions.map((s) => [s.id, s.program_id]));
  let attendance: Attendance[] = [];
  if (sessionIds.length) {
    const { data } = await supabase
      .from("attendance_records")
      .select("session_id, participant_id, status")
      .eq("org_id", ctx.orgId)
      .in("session_id", sessionIds);
    attendance = (data ?? []) as Attendance[];
  }

  // Options for the chosen cohort type, and how each resolves to program ids.
  const options: { id: string; name: string }[] =
    type === "program" ? programs.map((p) => ({ id: p.id, name: p.name }))
    : type === "site" ? sites
    : terms;

  function programIdsFor(id: string): Set<string> {
    if (type === "program") return new Set([id]);
    if (type === "site") return new Set(programs.filter((p) => p.site_id === id).map((p) => p.id));
    return new Set(programs.filter((p) => p.term_id === id).map((p) => p.id));
  }

  // Default A/B to the first two distinct options when unspecified.
  const aId = options.some((o) => o.id === sp.a) ? sp.a! : options[0]?.id ?? "";
  const bId = options.some((o) => o.id === sp.b) ? sp.b! : options.find((o) => o.id !== aId)?.id ?? "";
  const aOpt = options.find((o) => o.id === aId) ?? null;
  const bOpt = options.find((o) => o.id === bId) ?? null;

  const data = { sessions, attendance, enrollments, sessionProgram };
  const aMetrics = aOpt ? cohortMetrics(programIdsFor(aId), data) : null;
  const bMetrics = bOpt ? cohortMetrics(programIdsFor(bId), data) : null;
  const ready = aOpt && bOpt && aId !== bId;

  const rangeLabel = `${new Date(from).toLocaleDateString("en-US", { dateStyle: "medium" } as Intl.DateTimeFormatOptions)} – ${new Date(to).toLocaleDateString("en-US", { dateStyle: "medium" } as Intl.DateTimeFormatOptions)}`;
  const typeLabel = TYPES.find((t) => t.key === type)!.label.replace(/s$/, "").toLowerCase();

  const linkForType = (t: TypeKey) => `/analytics/compare?type=${t}&from=${from}&to=${to}`;

  return (
    <main className="dash">
      <PageHead href="/analytics" title="Cohort comparison" tone="violet">
        Put any two programs, sites, or terms side by side across the same metrics and date range.
      </PageHead>

      <div className="cmp-back">
        <Link href={`/analytics?from=${from}&to=${to}`} className="cmp-back-link">
          ← Back to Explorer
        </Link>
      </div>

      {/* cohort type + date range */}
      <section className="card">
        <div className="explorer-controls">
          <div className="seg-group">
            <span className="seg-label">Compare</span>
            <div className="seg">
              {TYPES.map((t) => (
                <Link key={t.key} href={linkForType(t.key)} className={t.key === type ? "seg-item active" : "seg-item"}>
                  {t.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <form className="explorer-range cmp-range" method="get">
          <input type="hidden" name="type" value={type} />
          <label>
            <span>Cohort A</span>
            <select name="a" defaultValue={aId}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Cohort B</span>
            <select name="b" defaultValue={bId}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>From</span>
            <input type="date" name="from" defaultValue={from} />
          </label>
          <label>
            <span>To</span>
            <input type="date" name="to" defaultValue={to} />
          </label>
          <button className="btn-primary" type="submit">Compare</button>
        </form>
      </section>

      {options.length < 2 ? (
        <section className="card">
          <p className="empty">You need at least two {typeLabel}s to compare. Add another first.</p>
        </section>
      ) : !ready ? (
        <section className="card">
          <p className="empty">Pick two different {typeLabel}s above to compare them.</p>
        </section>
      ) : (
        <section className="card">
          <div className="card-head">
            <h2>{aOpt!.name} vs {bOpt!.name}</h2>
            <div className="explorer-head-right">
              <span className="card-sub">{rangeLabel}</span>
              <ExplorerExport
                filename={`compare-${type}-${from}_${to}.xlsx`}
                sheetName={`${aOpt!.name} vs ${bOpt!.name}`}
                columns={["Metric", aOpt!.name, bOpt!.name, "Difference"]}
                rows={METRICS.map((m) => [
                  m.label,
                  fmt(aMetrics![m.key], m.unit),
                  fmt(bMetrics![m.key], m.unit),
                  fmtDelta(aMetrics![m.key], bMetrics![m.key], m.unit),
                ])}
              />
            </div>
          </div>

          <table className="explorer-table cmp-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="right">{aOpt!.name}</th>
                <th className="right">{bOpt!.name}</th>
                <th className="right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => {
                const a = aMetrics![m.key];
                const b = bMetrics![m.key];
                return (
                  <tr key={m.key}>
                    <td>{m.label}</td>
                    <td className="right num">{fmt(a, m.unit)}</td>
                    <td className="right num">{fmt(b, m.unit)}</td>
                    <td className={`right num ${deltaClass(a, b)}`}>{fmtDelta(a, b, m.unit)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="cmp-note">Difference is Cohort B minus Cohort A. Attendance rate differences are shown in percentage points (pp).</p>
        </section>
      )}

      <div className="explorer-foot cmp-defs">
        {METRICS.filter((m) => m.canon).map((m) => {
          const def = METRIC_DEFINITIONS[m.canon as keyof typeof METRIC_DEFINITIONS];
          return (
            <p key={m.key}>
              <strong>{def.label}:</strong> {def.formula}. {def.note}
            </p>
          );
        })}
      </div>
    </main>
  );
}
