import Link from "next/link";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import "./attendance.css";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export default async function AttendancePage() {
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + DAY);
  const windowStart = new Date(now.getTime() - 14 * DAY);

  const [sessionsRes, enrollRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, program_id, starts_at, room, status, programs(name)")
      .eq("org_id", ctx.orgId)
      .gte("starts_at", windowStart.toISOString())
      .lte("starts_at", todayEnd.toISOString())
      .order("starts_at", { ascending: true }),
    supabase
      .from("enrollments")
      .select("program_id, status")
      .eq("org_id", ctx.orgId),
  ]);

  const sessions = (sessionsRes.data ?? []) as unknown as {
    id: string;
    program_id: string;
    starts_at: string;
    room: string | null;
    status: string;
    programs: { name: string } | null;
  }[];
  const enrollments = enrollRes.data ?? [];

  // roster size per program (enrolled only)
  const rosterSize = new Map<string, number>();
  for (const e of enrollments) {
    if (e.status !== "enrolled") continue;
    rosterSize.set(e.program_id, (rosterSize.get(e.program_id) ?? 0) + 1);
  }

  // attendance counts per session
  const ids = sessions.map((s) => s.id);
  const attCount = new Map<string, number>();
  if (ids.length) {
    const { data: att } = await supabase
      .from("attendance_records")
      .select("session_id")
      .eq("org_id", ctx.orgId)
      .in("session_id", ids);
    for (const a of att ?? [])
      attCount.set(a.session_id, (attCount.get(a.session_id) ?? 0) + 1);
  }

  function decorate(s: (typeof sessions)[number]) {
    const roster = rosterSize.get(s.program_id) ?? 0;
    const recorded = attCount.get(s.id) ?? 0;
    return {
      ...s,
      roster,
      recorded,
      time: new Date(s.starts_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
      date: new Date(s.starts_at).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    };
  }

  const today = sessions
    .filter((s) => {
      const t = new Date(s.starts_at).getTime();
      return t >= todayStart.getTime() && t < todayEnd.getTime();
    })
    .map(decorate);

  // past sessions (>~ done) with no attendance recorded yet
  const needsAttention = sessions
    .filter((s) => new Date(s.starts_at).getTime() < todayStart.getTime())
    .map(decorate)
    .filter((s) => s.recorded === 0)
    .reverse();

  function Row({ s }: { s: ReturnType<typeof decorate> }) {
    const done = s.roster > 0 && s.recorded >= s.roster;
    return (
      <li className="att-session">
        <Link href={`/attendance/${s.id}`} className="att-session-link">
          <span className="ats-time num">{s.time}</span>
          <span className="ats-main">
            <span className="ats-prog">{s.programs?.name ?? "Session"}</span>
            <span className="ats-sub">
              {s.date} · {s.room ?? "—"}
            </span>
          </span>
          <span
            className={
              done ? "ats-status done" : s.recorded > 0 ? "ats-status partial" : "ats-status open"
            }
          >
            {done
              ? "complete"
              : s.recorded > 0
                ? `${s.recorded}/${s.roster} recorded`
                : "take attendance"}
          </span>
        </Link>
      </li>
    );
  }

  return (
    <main className="dash">
      <div className="dash-head">
        <h1>Attendance</h1>
        <p>Take attendance for today&rsquo;s sessions, or catch up on ones you missed.</p>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Today</h2>
          <span className="card-sub">
            {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </span>
        </div>
        {today.length === 0 ? (
          <p className="empty">No sessions scheduled today.</p>
        ) : (
          <ul className="att-sessions">
            {today.map((s) => (
              <Row key={s.id} s={s} />
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Needs attention</h2>
          <span className="card-sub">Past sessions with no attendance</span>
        </div>
        {needsAttention.length === 0 ? (
          <p className="empty good">All caught up. 🎉</p>
        ) : (
          <ul className="att-sessions">
            {needsAttention.map((s) => (
              <Row key={s.id} s={s} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
