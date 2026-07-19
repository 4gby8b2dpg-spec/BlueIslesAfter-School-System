import Link from "next/link";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { METRIC_DEFINITIONS, type MetricKey as CanonMetricKey } from "@/lib/metrics";
import { ExplorerExport } from "@/components/explorer-export";
import { Sparkline } from "@/components/sparkline";

export const dynamic = "force-dynamic";

// Explorer metrics. `canon` links to the canonical definition (lib/metrics.ts)
// so the footnote prints the same formula funders see in Reports. `dated` marks
// metrics that respect the date range; `enrolled` is a current-roster snapshot.
// `overTime` marks metrics that can be bucketed weekly in the trend view.
const METRICS = [
  { key: "enrolled", label: "Enrolled participants", unit: "count", dated: false, overTime: false, canon: null },
  { key: "attendance_rate", label: "Attendance rate", unit: "percent", dated: true, overTime: true, canon: "attendance_rate" },
  { key: "sessions_held", label: "Sessions held", unit: "count", dated: true, overTime: true, canon: null },
  { key: "unduplicated", label: "Unduplicated participants", unit: "count", dated: true, overTime: true, canon: "unduplicated_participants" },
  { key: "avg_daily", label: "Avg daily attendance", unit: "count", dated: true, overTime: true, canon: "avg_daily_attendance" },
] as const;

const DIMS = [
  { key: "program", label: "By program" },
  { key: "site", label: "By site" },
  { key: "grade", label: "By grade" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];
type DimKey = (typeof DIMS)[number]["key"];
type ViewKey = "dim" | "time";

// combinations with no meaningful grouping: sessions/daily attendance aren't per-grade
const UNSUPPORTED = new Set(["sessions_held:grade", "avg_daily:grade"]);

const WEEK_MS = 7 * 86_400_000;

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function shortDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ metric?: string; by?: string; from?: string; to?: string; view?: string }>;
}) {
  const ctx = await requireAppContext();
  const sp = await searchParams;

  const metric: MetricKey = METRICS.some((m) => m.key === sp.metric)
    ? (sp.metric as MetricKey)
    : "attendance_rate";
  const by: DimKey = DIMS.some((d) => d.key === sp.by) ? (sp.by as DimKey) : "program";
  const view: ViewKey = sp.view === "time" ? "time" : "dim";
  const metricDef = METRICS.find((m) => m.key === metric)!;
  const unsupported = view === "dim" && UNSUPPORTED.has(`${metric}:${by}`);
  const timeUnsupported = view === "time" && !metricDef.overTime;

  const now = new Date();
  const defFrom = new Date(now.getTime() - 60 * 86_400_000);
  const from = sp.from || iso(defFrom);
  const to = sp.to || iso(now);
  const fromTs = new Date(`${from}T00:00:00`).toISOString();
  const toTs = new Date(`${to}T23:59:59`).toISOString();

  const supabase = await createClient();
  const [programsRes, sitesRes, participantsRes, enrollRes, sessionsRes] = await Promise.all([
    supabase.from("programs").select("id, name, site_id").eq("org_id", ctx.orgId),
    supabase.from("sites").select("id, name").eq("org_id", ctx.orgId),
    supabase.from("participants").select("id, grade").eq("org_id", ctx.orgId),
    supabase.from("enrollments").select("participant_id, program_id, status").eq("org_id", ctx.orgId),
    supabase
      .from("sessions")
      .select("id, program_id, status, starts_at")
      .eq("org_id", ctx.orgId)
      .gte("starts_at", fromTs)
      .lte("starts_at", toTs),
  ]);

  const programs = programsRes.data ?? [];
  const sites = sitesRes.data ?? [];
  const participants = participantsRes.data ?? [];
  const enrollments = enrollRes.data ?? [];
  const sessions = (sessionsRes.data ?? []) as {
    id: string;
    program_id: string;
    status: string;
    starts_at: string;
  }[];

  // attendance is scoped to sessions inside the window
  const sessionIds = sessions.map((s) => s.id);
  const sessionProgram = new Map(sessions.map((s) => [s.id, s.program_id]));
  let attendance: { session_id: string; participant_id: string; status: string }[] = [];
  if (sessionIds.length) {
    const { data } = await supabase
      .from("attendance_records")
      .select("session_id, participant_id, status")
      .eq("org_id", ctx.orgId)
      .in("session_id", sessionIds);
    attendance = data ?? [];
  }

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
  const attended = (s: string) => s === "present" || s === "late";

  // ---- dimension view: group into rows ----
  type Row = { label: string; value: number; display: string };
  let rows: Row[] = [];

  if (view === "dim" && !unsupported) {
    if (metric === "enrolled") {
      const acc = new Map<string, number>();
      for (const e of enrollments) {
        if (e.status !== "enrolled") continue;
        const k = by === "grade" ? keyForParticipant(e.participant_id) : keyForProgram(e.program_id);
        if (!k) continue;
        acc.set(k, (acc.get(k) ?? 0) + 1);
      }
      rows = [...acc].map(([label, v]) => ({ label, value: v, display: String(v) }));
    } else if (metric === "sessions_held") {
      const acc = new Map<string, number>();
      for (const s of sessions) {
        if (s.status !== "completed") continue;
        const k = keyForProgram(s.program_id);
        if (!k) continue;
        acc.set(k, (acc.get(k) ?? 0) + 1);
      }
      rows = [...acc].map(([label, v]) => ({ label, value: v, display: String(v) }));
    } else if (metric === "attendance_rate") {
      const acc = new Map<string, { pres: number; tot: number }>();
      for (const a of attendance) {
        const k =
          by === "grade" ? keyForParticipant(a.participant_id) : keyForProgram(sessionProgram.get(a.session_id));
        if (!k) continue;
        const cur = acc.get(k) ?? { pres: 0, tot: 0 };
        if (attended(a.status)) {
          cur.pres++;
          cur.tot++;
        } else if (a.status === "absent") cur.tot++;
        acc.set(k, cur);
      }
      rows = [...acc].map(([label, v]) => {
        const rate = v.tot > 0 ? Math.round((v.pres / v.tot) * 100) : 0;
        return { label, value: rate, display: `${rate}%` };
      });
    } else if (metric === "unduplicated") {
      const acc = new Map<string, Set<string>>();
      for (const a of attendance) {
        if (!attended(a.status)) continue;
        const k =
          by === "grade" ? keyForParticipant(a.participant_id) : keyForProgram(sessionProgram.get(a.session_id));
        if (!k) continue;
        const set = acc.get(k) ?? new Set<string>();
        set.add(a.participant_id);
        acc.set(k, set);
      }
      rows = [...acc].map(([label, set]) => ({ label, value: set.size, display: String(set.size) }));
    } else if (metric === "avg_daily") {
      const perSession = new Map<string, number>();
      for (const a of attendance) {
        if (!attended(a.status)) continue;
        perSession.set(a.session_id, (perSession.get(a.session_id) ?? 0) + 1);
      }
      const acc = new Map<string, { sum: number; n: number }>();
      for (const s of sessions) {
        if (s.status !== "completed") continue;
        const k = keyForProgram(s.program_id);
        if (!k) continue;
        const cur = acc.get(k) ?? { sum: 0, n: 0 };
        cur.sum += perSession.get(s.id) ?? 0;
        cur.n++;
        acc.set(k, cur);
      }
      rows = [...acc].map(([label, v]) => {
        const avg = v.n > 0 ? Math.round((v.sum / v.n) * 10) / 10 : 0;
        return { label, value: avg, display: String(avg) };
      });
    }
    rows.sort((a, b) => b.value - a.value);
  }
  const maxVal = Math.max(1, ...rows.map((r) => r.value));

  // ---- time view: weekly buckets across [from, to] ----
  type Week = { label: string; value: number | null; display: string };
  let weeks: Week[] = [];

  if (view === "time" && !timeUnsupported) {
    const fromDate = new Date(`${from}T00:00:00`);
    const toDate = new Date(`${to}T23:59:59`);
    const n = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / WEEK_MS));
    const weekOf = (isoTs: string) => {
      const idx = Math.floor((new Date(isoTs).getTime() - fromDate.getTime()) / WEEK_MS);
      return Math.min(Math.max(idx, 0), n - 1);
    };
    const sessionWeek = new Map(sessions.map((s) => [s.id, weekOf(s.starts_at)]));

    // per-week accumulators
    const att = Array.from({ length: n }, () => ({ pres: 0, tot: 0 }));
    const held = new Array(n).fill(0);
    const uniq = Array.from({ length: n }, () => new Set<string>());
    const daily = Array.from({ length: n }, () => ({ sum: 0, n: 0 }));
    const perSession = new Map<string, number>();

    for (const s of sessions) {
      if (s.status === "completed") held[sessionWeek.get(s.id)!]++;
    }
    for (const a of attendance) {
      const wk = sessionWeek.get(a.session_id);
      if (wk == null) continue;
      if (metric === "attendance_rate") {
        if (attended(a.status)) {
          att[wk].pres++;
          att[wk].tot++;
        } else if (a.status === "absent") att[wk].tot++;
      } else if (attended(a.status)) {
        uniq[wk].add(a.participant_id);
        perSession.set(a.session_id, (perSession.get(a.session_id) ?? 0) + 1);
      }
    }
    if (metric === "avg_daily") {
      for (const s of sessions) {
        if (s.status !== "completed") continue;
        const wk = sessionWeek.get(s.id)!;
        daily[wk].sum += perSession.get(s.id) ?? 0;
        daily[wk].n++;
      }
    }

    weeks = Array.from({ length: n }, (_, i) => {
      const label = shortDate(new Date(fromDate.getTime() + i * WEEK_MS));
      if (metric === "attendance_rate") {
        const { pres, tot } = att[i];
        if (tot === 0) return { label, value: null, display: "—" };
        const rate = Math.round((pres / tot) * 100);
        return { label, value: rate, display: `${rate}%` };
      }
      if (metric === "sessions_held") return { label, value: held[i], display: String(held[i]) };
      if (metric === "unduplicated") return { label, value: uniq[i].size, display: String(uniq[i].size) };
      // avg_daily
      const { sum, n: cnt } = daily[i];
      if (cnt === 0) return { label, value: null, display: "—" };
      const avg = Math.round((sum / cnt) * 10) / 10;
      return { label, value: avg, display: String(avg) };
    });
  }
  const weekPoints = weeks.map((w) => w.value);
  const weekMax = Math.max(1, ...weekPoints.filter((v): v is number => v != null));
  const isPercent = metric === "attendance_rate";

  const dimLabel = DIMS.find((d) => d.key === by)!.label.replace("By ", "");
  const canonDef = metricDef.canon ? METRIC_DEFINITIONS[metricDef.canon as CanonMetricKey] : null;

  const linkFor = (m: MetricKey, d: DimKey, v: ViewKey = view) =>
    `/analytics?metric=${m}&by=${d}&view=${v}&from=${from}&to=${to}`;
  const rangeLabel = `${new Date(from).toLocaleDateString("en-US", { dateStyle: "medium" } as Intl.DateTimeFormatOptions)} – ${new Date(to).toLocaleDateString("en-US", { dateStyle: "medium" } as Intl.DateTimeFormatOptions)}`;

  return (
    <main className="dash">
      <div className="dash-head">
        <h1>Analytics Explorer</h1>
        <p>Slice a metric by a dimension or track it over time — the numbers behind the dashboard.</p>
      </div>

      {/* date range */}
      <form className="explorer-range" method="get">
        <input type="hidden" name="metric" value={metric} />
        <input type="hidden" name="by" value={by} />
        <input type="hidden" name="view" value={view} />
        <label>
          <span>From</span>
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label>
          <span>To</span>
          <input type="date" name="to" defaultValue={to} />
        </label>
        <button className="btn-primary" type="submit">
          Apply
        </button>
        {!metricDef.dated && (
          <span className="explorer-range-note">
            Enrolled is a current-roster snapshot — not affected by the date range.
          </span>
        )}
      </form>

      {/* metric + view + dimension selectors */}
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
            <span className="seg-label">View</span>
            <div className="seg">
              <Link href={linkFor(metric, by, "dim")} className={view === "dim" ? "seg-item active" : "seg-item"}>
                By dimension
              </Link>
              <Link href={linkFor(metric, by, "time")} className={view === "time" ? "seg-item active" : "seg-item"}>
                Over time
              </Link>
            </div>
          </div>
          {view === "dim" && (
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
          )}
        </div>
      </section>

      {/* result */}
      <section className="card">
        <div className="card-head">
          <h2>
            {metricDef.label}
            {view === "dim" ? ` · ${DIMS.find((d) => d.key === by)!.label.toLowerCase()}` : " · weekly"}
          </h2>
          <div className="explorer-head-right">
            {metricDef.dated && <span className="card-sub">{rangeLabel}</span>}
            {view === "dim" && rows.length > 0 && (
              <ExplorerExport
                filename={`explorer-${metric}-${by}-${from}_${to}.xlsx`}
                sheetName={`${metricDef.label} by ${dimLabel}`}
                columns={[dimLabel, metricDef.label]}
                rows={rows.map((r) => [r.label, r.display])}
              />
            )}
            {view === "time" && weeks.length > 0 && (
              <ExplorerExport
                filename={`explorer-${metric}-weekly-${from}_${to}.xlsx`}
                sheetName={`${metricDef.label} weekly`}
                columns={["Week of", metricDef.label]}
                rows={weeks.map((w) => [w.label, w.display])}
              />
            )}
          </div>
        </div>

        {view === "dim" ? (
          unsupported ? (
            <p className="empty">
              {metricDef.label} isn&rsquo;t tracked per grade. Try grouping by program or site.
            </p>
          ) : rows.length === 0 ? (
            <p className="empty">No data for this combination in the selected range.</p>
          ) : (
            <>
              <ul className="bars">
                {rows.map((r, i) => (
                  <li key={i} className="bar-row">
                    <span className="bar-name">{r.label}</span>
                    <span className="bar-track">
                      <span className="bar-fill" style={{ width: `${(r.value / maxVal) * 100}%` }} />
                    </span>
                    <span className="bar-val num">{r.display}</span>
                  </li>
                ))}
              </ul>

              <table className="explorer-table">
                <thead>
                  <tr>
                    <th>{dimLabel}</th>
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
          )
        ) : timeUnsupported ? (
          <p className="empty">
            {metricDef.label} is a snapshot, not a trend. Pick a time-based metric to chart it weekly.
          </p>
        ) : weekPoints.filter((v) => v != null).length < 2 ? (
          <p className="empty">Not enough weekly data in this range to chart a trend yet.</p>
        ) : (
          <>
            <div className="explorer-trend">
              <Sparkline
                points={weekPoints}
                label={`${metricDef.label} by week`}
                yMin={isPercent ? undefined : 0}
                yMax={isPercent ? undefined : weekMax}
                grid
                unit={isPercent ? "%" : ""}
              />
              <div className="explorer-trend-ends">
                <span>{weeks[0]?.label}</span>
                <span>{weeks[weeks.length - 1]?.label}</span>
              </div>
            </div>

            <table className="explorer-table">
              <thead>
                <tr>
                  <th>Week of</th>
                  <th className="right">{metricDef.label}</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w, i) => (
                  <tr key={i}>
                    <td>{w.label}</td>
                    <td className="right num">{w.display}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {canonDef && (
        <p className="explorer-foot">
          <strong>{canonDef.label}:</strong> {canonDef.formula}. {canonDef.note}
        </p>
      )}
    </main>
  );
}
