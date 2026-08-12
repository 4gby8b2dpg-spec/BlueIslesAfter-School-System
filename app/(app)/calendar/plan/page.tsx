import Link from "next/link";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/print-button";
import { catColor } from "@/lib/cat-colors";
import "../calendar.css";

export const dynamic = "force-dynamic";

// FR-E.6 — term planning mode. One row per program, one column per week of the
// term: at a glance, which weeks each program runs, where the gaps are, and
// which weeks are overloaded. Derived entirely from sessions — no schema.

type Term = { id: string; name: string; starts_on: string | null; ends_on: string | null };

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Monday of the week containing d (local time, midnight).
function mondayOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const shift = (x.getDay() + 6) % 7; // Sun=0 → 6, Mon=1 → 0 …
  x.setDate(x.getDate() - shift);
  return x;
}

function fmtWeek(d: Date) {
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  const ctx = await requireAppContext();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: termsData } = await supabase
    .from("terms")
    .select("id, name, starts_on, ends_on")
    .eq("org_id", ctx.orgId)
    .order("starts_on", { ascending: false });
  // Only terms with both dates can frame the grid (the columns are dates).
  const terms = ((termsData ?? []) as Term[]).filter((t) => t.starts_on && t.ends_on);

  // Selected term: URL param, else the term containing today, else the most
  // recent, else a rolling 12-week window so the view works with no terms set.
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const term =
    terms.find((t) => t.id === sp.term) ??
    terms.find((t) => t.starts_on! <= todayIso && t.ends_on! >= todayIso) ??
    terms[0] ??
    null;

  const rangeStart = term
    ? new Date(`${term.starts_on}T00:00:00`)
    : mondayOf(today);
  const rangeEnd = term
    ? new Date(`${term.ends_on}T23:59:59`)
    : new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() + 12 * 7 - 1, 23, 59, 59);

  const [sessionsRes, programsRes, closuresRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("program_id, starts_at, status")
      .eq("org_id", ctx.orgId)
      .neq("status", "cancelled")
      .gte("starts_at", rangeStart.toISOString())
      .lte("starts_at", rangeEnd.toISOString()),
    supabase
      .from("programs")
      .select("id, name, category, status, sites(name)")
      .eq("org_id", ctx.orgId)
      .neq("status", "archived")
      .order("name"),
    supabase
      .from("calendar_events")
      .select("starts_at")
      .eq("org_id", ctx.orgId)
      .eq("event_type", "closure")
      .gte("starts_at", rangeStart.toISOString())
      .lte("starts_at", rangeEnd.toISOString()),
  ]);

  const sessions = sessionsRes.data ?? [];
  const programs = (programsRes.data ?? []) as unknown as {
    id: string;
    name: string;
    category: string | null;
    status: string;
    sites: { name: string } | null;
  }[];

  // The term's week columns, Monday-start.
  const firstWeek = mondayOf(rangeStart);
  const weeks: Date[] = [];
  for (let w = new Date(firstWeek); w <= rangeEnd; w.setDate(w.getDate() + 7)) {
    weeks.push(new Date(w));
  }
  const weekIndex = (iso: string) => {
    const d = new Date(iso);
    return Math.floor((mondayOf(d).getTime() - firstWeek.getTime()) / (7 * 86400e3));
  };

  // Sessions per program per week.
  const counts = new Map<string, number[]>();
  for (const s of sessions) {
    const wi = weekIndex(s.starts_at as string);
    if (wi < 0 || wi >= weeks.length) continue;
    const row = counts.get(s.program_id as string) ?? Array(weeks.length).fill(0);
    row[wi] += 1;
    counts.set(s.program_id as string, row);
  }

  // Weeks containing an org closure — context for why a week might be light.
  const closureWeeks = new Set<number>();
  for (const c of closuresRes.data ?? []) {
    const wi = weekIndex(c.starts_at as string);
    if (wi >= 0 && wi < weeks.length) closureWeeks.add(wi);
  }

  const scheduled = programs.filter((p) => counts.has(p.id));
  const unscheduled = programs.filter((p) => !counts.has(p.id) && p.status === "active");

  // Per-program norm: the median of its non-zero weekly counts. A gap is a zero
  // week strictly inside the program's active span; an overload is a week at
  // 2x the norm or more (min 2 sessions above nothing).
  type Row = {
    program: (typeof programs)[number];
    cells: { count: number; gap: boolean; overload: boolean }[];
    total: number;
  };
  const rows: Row[] = scheduled.map((p) => {
    const c = counts.get(p.id)!;
    const active = c.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);
    const first = active[0];
    const last = active[active.length - 1];
    const nonZero = c.filter((n) => n > 0).sort((a, b) => a - b);
    const median = nonZero[Math.floor(nonZero.length / 2)] ?? 0;
    const cells = c.map((count, i) => ({
      count,
      gap: count === 0 && i > first && i < last,
      overload: median > 0 && count >= Math.max(2, median * 2),
    }));
    return { program: p, cells, total: c.reduce((a, b) => a + b, 0) };
  });

  const weekTotals = weeks.map((_, i) => rows.reduce((sum, r) => sum + r.cells[i].count, 0));
  const maxCount = Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c.count)));
  const maxTotal = Math.max(1, ...weekTotals);

  // Month header groups: consecutive week columns sharing a calendar month.
  const monthGroups: { label: string; span: number }[] = [];
  for (const w of weeks) {
    const label = `${MONTHS_SHORT[w.getMonth()]} ${w.getFullYear()}`;
    const lastGroup = monthGroups[monthGroups.length - 1];
    if (lastGroup && lastGroup.label === label) lastGroup.span += 1;
    else monthGroups.push({ label, span: 1 });
  }

  const thisWeekIdx = weekIndex(today.toISOString());

  return (
    <main className="dash">
      <div className="cal-head">
        <div className="cal-nav">
          <h1>Term planning</h1>
          <Link className="cal-mode-toggle" href="/calendar">
            Month view
          </Link>
        </div>
        <form method="get" className="cal-filter">
          {terms.length > 0 && (
            <select name="term" defaultValue={term?.id ?? ""} aria-label="Term">
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <button className="btn-primary" type="submit">
            View
          </button>
          <PrintButton label="Print / PDF" />
        </form>
      </div>

      <div className="cal-print-title" aria-hidden="true">
        <h1>Term planning{term ? ` — ${term.name}` : ""}</h1>
        <span>{ctx.orgName}</span>
      </div>

      <p className="plan-sub">
        {term
          ? `${term.name}: ${new Date(`${term.starts_on}T00:00:00`).toLocaleDateString()} – ${new Date(`${term.ends_on}T00:00:00`).toLocaleDateString()}`
          : "No terms defined — showing the next 12 weeks. Add terms in Settings for true term planning."}
        {" · "}
        {rows.length} program{rows.length === 1 ? "" : "s"} scheduled
      </p>

      {rows.length === 0 ? (
        <section className="card">
          <p className="empty">
            No sessions scheduled in this range yet. Add sessions from a program&rsquo;s page and
            they&rsquo;ll appear here week by week.
          </p>
        </section>
      ) : (
        <section className="card plan-card">
          <div className="plan-scroll">
            <table className="plan-grid">
              <thead>
                <tr>
                  <th className="plan-prog-col" rowSpan={2} scope="col">
                    Program
                  </th>
                  {monthGroups.map((g, i) => (
                    <th key={i} colSpan={g.span} className="plan-month" scope="colgroup">
                      {g.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  {weeks.map((w, i) => (
                    <th
                      key={i}
                      scope="col"
                      className={`plan-week${i === thisWeekIdx ? " now" : ""}`}
                      title={closureWeeks.has(i) ? "Closure this week" : undefined}
                    >
                      {fmtWeek(w)}
                      {closureWeeks.has(i) && <span className="plan-closure-dot" aria-label="closure" />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ program: p, cells, total }) => (
                  <tr key={p.id}>
                    <th scope="row" className="plan-prog-col">
                      <Link href={`/programs/${p.id}`} className="plan-prog">
                        <span className="cal-dot" style={{ background: catColor(p.category) }} />
                        <span className="plan-prog-name">{p.name}</span>
                      </Link>
                      <span className="plan-prog-meta">
                        {p.sites?.name ? `${p.sites.name} · ` : ""}
                        <span className="num">{total}</span> sessions
                      </span>
                    </th>
                    {cells.map((c, i) => (
                      <td
                        key={i}
                        className={`plan-cell${c.gap ? " gap" : ""}${c.overload ? " overload" : ""}${i === thisWeekIdx ? " now" : ""}`}
                        title={
                          c.gap
                            ? `${p.name}: no sessions the week of ${fmtWeek(weeks[i])}`
                            : c.overload
                              ? `${p.name}: ${c.count} sessions — above its usual week`
                              : c.count
                                ? `${p.name}: ${c.count} session${c.count === 1 ? "" : "s"}`
                                : undefined
                        }
                      >
                        {c.count > 0 ? (
                          <span
                            className="plan-fill num"
                            style={{
                              background: `rgba(13, 148, 136, ${0.14 + 0.5 * (c.count / maxCount)})`,
                            }}
                          >
                            {c.count}
                          </span>
                        ) : c.gap ? (
                          <span className="plan-gap-mark" aria-label="gap">
                            —
                          </span>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="plan-prog-col plan-total-label">
                    All programs
                  </th>
                  {weekTotals.map((t, i) => (
                    <td key={i} className={`plan-cell total${i === thisWeekIdx ? " now" : ""}`}>
                      {t > 0 && (
                        <span
                          className="plan-fill num total"
                          style={{ background: `rgba(109, 94, 240, ${0.12 + 0.45 * (t / maxTotal)})` }}
                        >
                          {t}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="plan-legend">
            <span className="plan-legend-item">
              <span className="plan-swatch run" /> sessions that week (darker = more)
            </span>
            <span className="plan-legend-item">
              <span className="plan-swatch gap">—</span> gap inside a program&rsquo;s run
            </span>
            <span className="plan-legend-item">
              <span className="plan-swatch overload" /> well above that program&rsquo;s usual week
            </span>
            <span className="plan-legend-item">
              <span className="plan-closure-dot" /> org closure that week
            </span>
          </div>
        </section>
      )}

      {unscheduled.length > 0 && (
        <p className="cal-foot">
          Active but not scheduled this term: {unscheduled.map((p) => p.name).join(", ")}.
        </p>
      )}
    </main>
  );
}
