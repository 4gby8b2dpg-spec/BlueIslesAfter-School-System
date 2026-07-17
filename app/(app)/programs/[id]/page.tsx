import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { NewSessionForm } from "@/components/new-session-form";
import "../programs.css";

export const dynamic = "force-dynamic";

export default async function ProgramDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const { data: program } = await supabase
    .from("programs")
    .select("id, name, category, capacity, status, funding_source, ratio_target, sites(name), terms(name)")
    .eq("org_id", ctx.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!program) notFound();

  const site = program.sites as unknown as { name: string } | null;
  const term = program.terms as unknown as { name: string } | null;

  const [enrollRes, sessionsRes] = await Promise.all([
    supabase
      .from("enrollments")
      .select("status, participants(id, first_name, last_name, grade)")
      .eq("org_id", ctx.orgId)
      .eq("program_id", id),
    supabase
      .from("sessions")
      .select("id, starts_at, room, status")
      .eq("org_id", ctx.orgId)
      .eq("program_id", id)
      .order("starts_at", { ascending: true }),
  ]);

  const enrollments = (enrollRes.data ?? []) as unknown as {
    status: string;
    participants: { id: string; first_name: string; last_name: string; grade: string | null } | null;
  }[];
  const sessions = sessionsRes.data ?? [];

  // attendance across this program's sessions
  const sessionIds = sessions.map((s) => s.id);
  const recordedBySession = new Map<string, number>();
  let pres = 0,
    tot = 0;
  if (sessionIds.length) {
    const { data: att } = await supabase
      .from("attendance_records")
      .select("status, session_id")
      .eq("org_id", ctx.orgId)
      .in("session_id", sessionIds);
    for (const a of att ?? []) {
      recordedBySession.set(a.session_id, (recordedBySession.get(a.session_id) ?? 0) + 1);
      if (a.status === "present" || a.status === "late") {
        pres++;
        tot++;
      } else if (a.status === "absent") tot++;
    }
  }

  const roster = enrollments
    .filter((e) => e.status === "enrolled" && e.participants)
    .map((e) => e.participants!)
    .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
  const everEnrolled = enrollments.length;
  const retained = enrollments.filter((e) => ["enrolled", "completed"].includes(e.status)).length;

  const rate = tot > 0 ? Math.round((pres / tot) * 100) : null;
  const sessionsHeld = sessions.filter((s) => s.status === "completed").length;
  const capacity = program.capacity ?? 0;
  const pct = capacity > 0 ? Math.min(100, Math.round((roster.length / capacity) * 100)) : 0;
  const full = capacity > 0 && roster.length >= capacity;

  const now = Date.now();
  const upcoming = sessions.filter((s) => new Date(s.starts_at).getTime() >= now);
  const past = sessions.filter((s) => new Date(s.starts_at).getTime() < now).reverse();
  const canEdit = ["admin", "director", "staff"].includes(ctx.role);
  const todayStr = new Date().toISOString().slice(0, 10);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <main className="dash">
      <div className="profile-back">
        <Link href="/programs">← All programs</Link>
      </div>

      <section className="card profile-head">
        <div className="profile-id">
          <h1>{program.name}</h1>
          <div className="profile-meta">
            {program.category && <span className="prog-cat">{program.category}</span>}
            {site?.name && <span>{site.name}</span>}
            {term?.name && <span>{term.name}</span>}
            {program.funding_source && <span>Funder: {program.funding_source}</span>}
          </div>
        </div>
        <div className="profile-chips">
          <span className={`prog-status ${program.status}`}>{program.status}</span>
        </div>
      </section>

      {/* analytics tiles */}
      <section className="prog-stats">
        <div className="ps-tile">
          <div className="ps-val num">
            {roster.length}
            {capacity > 0 ? <span className="ps-cap">/{capacity}</span> : null}
          </div>
          <div className="ps-lab">Enrolled{full ? " · full" : ""}</div>
          {capacity > 0 && (
            <div className="prog-gauge-track slim">
              <div className={full ? "prog-gauge-fill full" : "prog-gauge-fill"} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <div className="ps-tile">
          <div className="ps-val num">{rate == null ? "—" : `${rate}%`}</div>
          <div className="ps-lab">Attendance rate</div>
        </div>
        <div className="ps-tile">
          <div className="ps-val num">{sessionsHeld}</div>
          <div className="ps-lab">Sessions held</div>
        </div>
        <div className="ps-tile">
          <div className="ps-val num">
            {everEnrolled > 0 ? Math.round((retained / everEnrolled) * 100) : 0}%
          </div>
          <div className="ps-lab">Retention</div>
        </div>
      </section>

      <div className="profile-grid">
        {/* schedule */}
        <section className="card">
          <div className="card-head">
            <h2>Schedule</h2>
            <span className="card-sub">{sessions.length} sessions</span>
          </div>

          {canEdit && (
            <div className="new-session">
              <NewSessionForm programId={program.id} todayStr={todayStr} />
            </div>
          )}

          {sessions.length === 0 ? (
            <p className="empty">No sessions scheduled.</p>
          ) : (
            <>
              {upcoming.length > 0 && (
                <>
                  <p className="sched-group">Upcoming</p>
                  <ul className="prog-sessions">
                    {upcoming.map((s) => (
                      <li key={s.id} className="prog-session">
                        <span>{fmt(s.starts_at)}</span>
                        <span className="ps-room">{s.room ?? "—"}</span>
                        <Link href={`/attendance/${s.id}`} className="ps-take">
                          Take attendance
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {past.length > 0 && (
                <>
                  <p className="sched-group">Past</p>
                  <ul className="prog-sessions">
                    {past.slice(0, 8).map((s) => {
                      const rec = recordedBySession.get(s.id) ?? 0;
                      return (
                        <li key={s.id} className="prog-session past">
                          <span>{fmt(s.starts_at)}</span>
                          <span className="ps-room">{s.room ?? "—"}</span>
                          <Link href={`/attendance/${s.id}`} className="ps-take">
                            {rec > 0 ? `${rec} recorded` : "no attendance"}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          )}
        </section>

        {/* roster */}
        <section className="card">
          <div className="card-head">
            <h2>Roster</h2>
            <span className="card-sub">{roster.length} enrolled</span>
          </div>
          {roster.length === 0 ? (
            <p className="empty">No one enrolled yet.</p>
          ) : (
            <ul className="prog-roster">
              {roster.map((p) => (
                <li key={p.id} className="pr-row">
                  <Link href={`/participants/${p.id}`} className="roster-name">
                    {p.first_name} {p.last_name}
                  </Link>
                  <span className="pr-grade">Gr {p.grade ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
