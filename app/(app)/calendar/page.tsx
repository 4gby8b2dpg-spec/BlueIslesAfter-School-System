import Link from "next/link";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import "./calendar.css";

export const dynamic = "force-dynamic";

// Categorical palette — deliberately distinct from the brand (teal/marigold)
// and semantic (good/warn/crit) colors, so a category never reads as a status.
const CAT_COLOR: Record<string, string> = {
  tutoring: "#2563EB",
  STEM: "#7C3AED",
  sports: "#DB2777",
  arts: "#C2410C",
  enrichment: "#0891B2",
};
const OTHER_COLOR = "#64748B";
const catColor = (c: string | null) => (c && CAT_COLOR[c]) || OTHER_COLOR;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ym(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; program?: string }>;
}) {
  const ctx = await requireAppContext();
  const sp = await searchParams;

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  const m = /^(\d{4})-(\d{2})$/.exec(sp.month ?? "");
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]) - 1;
  }
  const programFilter = sp.program ?? "";

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const rangeStart = new Date(year, month, 1, 0, 0, 0).toISOString();
  const rangeEnd = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  const supabase = await createClient();
  const [sessionsRes, eventsRes, programsRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, program_id, starts_at, room, status, programs(name, category)")
      .eq("org_id", ctx.orgId)
      .gte("starts_at", rangeStart)
      .lte("starts_at", rangeEnd)
      .order("starts_at", { ascending: true }),
    supabase
      .from("calendar_events")
      .select("id, title, event_type, starts_at, all_day")
      .eq("org_id", ctx.orgId)
      .gte("starts_at", rangeStart)
      .lte("starts_at", rangeEnd),
    supabase.from("programs").select("id, name").eq("org_id", ctx.orgId).order("name"),
  ]);

  let sessions = (sessionsRes.data ?? []) as unknown as {
    id: string;
    program_id: string;
    starts_at: string;
    room: string | null;
    status: string;
    programs: { name: string; category: string | null } | null;
  }[];
  if (programFilter) sessions = sessions.filter((s) => s.program_id === programFilter);
  const events = eventsRes.data ?? [];
  const programs = programsRes.data ?? [];

  // bucket by day-of-month
  const byDay = new Map<number, typeof sessions>();
  for (const s of sessions) {
    const d = new Date(s.starts_at).getDate();
    const arr = byDay.get(d) ?? [];
    arr.push(s);
    byDay.set(d, arr);
  }
  const closureDays = new Set<number>();
  const eventsByDay = new Map<number, typeof events>();
  for (const e of events) {
    const d = new Date(e.starts_at as string).getDate();
    if (e.event_type === "closure") closureDays.add(d);
    const arr = eventsByDay.get(d) ?? [];
    arr.push(e);
    eventsByDay.set(d, arr);
  }

  const leading = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();
  const cells: (number | null)[] = [
    ...Array(leading).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const isThisMonth = now.getFullYear() === year && now.getMonth() === month;
  const todayDate = now.getDate();

  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);
  const qp = (mm: string) =>
    `/calendar?month=${mm}${programFilter ? `&program=${programFilter}` : ""}`;

  // categories present this month, for the legend
  const catsPresent = [...new Set(sessions.map((s) => s.programs?.category ?? "other"))];

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <main className="dash">
      <div className="cal-head">
        <div className="cal-nav">
          <Link className="cal-arrow" href={qp(ym(prev.getFullYear(), prev.getMonth()))} aria-label="Previous month">
            ‹
          </Link>
          <h1>
            {MONTHS[month]} {year}
          </h1>
          <Link className="cal-arrow" href={qp(ym(next.getFullYear(), next.getMonth()))} aria-label="Next month">
            ›
          </Link>
          {!isThisMonth && (
            <Link className="cal-today" href={qp(ym(now.getFullYear(), now.getMonth()))}>
              Today
            </Link>
          )}
        </div>
        <form method="get" className="cal-filter">
          <input type="hidden" name="month" value={ym(year, month)} />
          <select name="program" defaultValue={programFilter} aria-label="Filter by program">
            <option value="">All programs</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="btn-primary" type="submit">
            Filter
          </button>
        </form>
      </div>

      {catsPresent.length > 0 && (
        <div className="cal-legend">
          {catsPresent.map((c) => (
            <span key={c} className="cal-legend-item">
              <span className="cal-dot" style={{ background: catColor(c === "other" ? null : c) }} />
              {c}
            </span>
          ))}
        </div>
      )}

      <section className="card cal-card">
        <div className="cal-grid cal-weekdays">
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal-weekday">
              {w}
            </div>
          ))}
        </div>
        <div className="cal-grid">
          {cells.map((day, i) => {
            if (day == null) return <div key={i} className="cal-cell empty" />;
            const daySessions = byDay.get(day) ?? [];
            const dayEvents = eventsByDay.get(day) ?? [];
            const closed = closureDays.has(day);
            const isToday = isThisMonth && day === todayDate;
            return (
              <div key={i} className={`cal-cell${closed ? " closed" : ""}${isToday ? " today" : ""}`}>
                <span className="cal-daynum">{day}</span>
                {closed && <span className="cal-closed">Closed</span>}
                <div className="cal-events">
                  {daySessions.slice(0, 3).map((s) => (
                    <Link
                      key={s.id}
                      href={`/attendance/${s.id}`}
                      className="cal-chip"
                      style={{ borderLeftColor: catColor(s.programs?.category ?? null) }}
                      title={`${s.programs?.name ?? "Session"} · ${fmtTime(s.starts_at)}${s.room ? " · " + s.room : ""}`}
                    >
                      <span className="cal-chip-time num">{fmtTime(s.starts_at)}</span>
                      <span className="cal-chip-name">{s.programs?.name ?? "Session"}</span>
                    </Link>
                  ))}
                  {daySessions.length > 3 && (
                    <span className="cal-more">+{daySessions.length - 3} more</span>
                  )}
                  {dayEvents
                    .filter((e) => e.event_type !== "closure")
                    .slice(0, 1)
                    .map((e) => (
                      <span key={e.id} className="cal-chip event">
                        <span className="cal-chip-name">{e.title}</span>
                      </span>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="cal-foot">
        Sessions link to their attendance check-in. Add sessions from a program&rsquo;s
        page.
      </p>
    </main>
  );
}
