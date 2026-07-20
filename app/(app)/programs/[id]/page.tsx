import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { NewSessionForm } from "@/components/new-session-form";
import { DeleteProgramButton } from "@/components/delete-program-button";
import { enrollParticipant } from "../../participants/actions";
import { AddParticipantForm } from "@/components/add-participant-form";
import { EditCapacityForm } from "@/components/edit-capacity-form";
import { Sparkline } from "@/components/sparkline";
import { promoteFromWaitlist, updateProgramCapacity } from "../actions";
import "../programs.css";
import { CardIcon } from "@/components/card-icon";

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

  const [enrollRes, sessionsRes, participantsRes] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, status, waitlist_position, participants(id, first_name, last_name, grade)")
      .eq("org_id", ctx.orgId)
      .eq("program_id", id),
    supabase
      .from("sessions")
      .select("id, starts_at, room, status")
      .eq("org_id", ctx.orgId)
      .eq("program_id", id)
      .order("starts_at", { ascending: true }),
    supabase
      .from("participants")
      .select("id, first_name, last_name")
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .order("last_name"),
  ]);

  const enrollments = (enrollRes.data ?? []) as unknown as {
    id: string;
    status: string;
    waitlist_position: number | null;
    participants: { id: string; first_name: string; last_name: string; grade: string | null } | null;
  }[];
  const sessions = sessionsRes.data ?? [];

  // attendance across this program's sessions
  const sessionIds = sessions.map((s) => s.id);
  const recordedBySession = new Map<string, number>();
  const presBySession = new Map<string, number>();
  const totBySession = new Map<string, number>();
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
      const attended = a.status === "present" || a.status === "late";
      if (attended) {
        pres++;
        presBySession.set(a.session_id, (presBySession.get(a.session_id) ?? 0) + 1);
      }
      if (attended || a.status === "absent") {
        tot++;
        totBySession.set(a.session_id, (totBySession.get(a.session_id) ?? 0) + 1);
      }
    }
  }

  // Attendance-rate trend: one point per completed session, chronological, last 12.
  const trend = sessions
    .filter((s) => s.status === "completed")
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))
    .slice(-12)
    .map((s) => {
      const t = totBySession.get(s.id) ?? 0;
      return t > 0 ? Math.round(((presBySession.get(s.id) ?? 0) / t) * 100) : null;
    });
  const trendPoints = trend.filter((p) => p != null).length;

  // Average survey rating (1–5 questions) from surveys linked to this program.
  let surveyRating: number | null = null;
  let ratingCount = 0;
  const { data: linkedSurveys } = await supabase
    .from("surveys")
    .select("id")
    .eq("org_id", ctx.orgId)
    .eq("program_id", id);
  if (linkedSurveys && linkedSurveys.length) {
    const { data: rq } = await supabase
      .from("survey_questions")
      .select("id")
      .eq("org_id", ctx.orgId)
      .in("survey_id", linkedSurveys.map((s) => s.id))
      .eq("qtype", "rating_1_5");
    const rqIds = (rq ?? []).map((q) => q.id);
    if (rqIds.length) {
      const { data: ans } = await supabase
        .from("survey_answers")
        .select("value")
        .eq("org_id", ctx.orgId)
        .in("question_id", rqIds);
      const nums = (ans ?? [])
        .map((a) => Number(a.value))
        .filter((n) => !Number.isNaN(n) && n >= 1 && n <= 5);
      if (nums.length) {
        surveyRating = nums.reduce((s, n) => s + n, 0) / nums.length;
        ratingCount = nums.length;
      }
    }
  }

  const roster = enrollments
    .filter((e) => e.status === "enrolled" && e.participants)
    .map((e) => e.participants!)
    .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
  const waitlist = enrollments
    .filter((e) => e.status === "waitlisted" && e.participants)
    .sort((a, b) => (a.waitlist_position ?? 0) - (b.waitlist_position ?? 0));
  const everEnrolled = enrollments.length;

  // Participants not already holding an enrolled/waitlisted spot in this program.
  const heldIds = new Set(
    enrollments
      .filter((e) => ["enrolled", "waitlisted"].includes(e.status) && e.participants)
      .map((e) => e.participants!.id),
  );
  const addable = (participantsRes.data ?? []).filter((p) => !heldIds.has(p.id));
  const retained = enrollments.filter((e) => ["enrolled", "completed"].includes(e.status)).length;

  const rate = tot > 0 ? Math.round((pres / tot) * 100) : null;
  const sessionsHeld = sessions.filter((s) => s.status === "completed").length;
  const capacity = program.capacity ?? 0;
  const pct = capacity > 0 ? Math.min(100, Math.round((roster.length / capacity) * 100)) : 0;
  const full = capacity > 0 && roster.length >= capacity;

  const now = new Date().getTime();
  const upcoming = sessions.filter((s) => new Date(s.starts_at).getTime() >= now);
  const past = sessions.filter((s) => new Date(s.starts_at).getTime() < now).reverse();
  const canEdit = ["admin", "director", "staff"].includes(ctx.role);
  const canDelete = ["admin", "director"].includes(ctx.role);
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
          {canDelete && (
            <EditCapacityForm
              action={updateProgramCapacity}
              programId={program.id}
              capacity={capacity}
            />
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
        <div className="ps-tile">
          <div className="ps-val num">
            {surveyRating == null ? "—" : `${(Math.round(surveyRating * 10) / 10).toFixed(1)}`}
            {surveyRating != null && <span className="ps-cap">/5</span>}
          </div>
          <div className="ps-lab">
            Avg rating{surveyRating != null ? ` · ${ratingCount}` : ""}
          </div>
        </div>
      </section>

      {trendPoints >= 2 && (
        <section className="card prog-trend">
          <div className="card-head">
            <div className="card-title">
              <span className="spot teal"><CardIcon name="chart" /></span>
              <h2>Attendance trend</h2>
            </div>
            <span className="card-sub">Last {trend.length} completed sessions</span>
          </div>
          <Sparkline points={trend} label="Attendance rate by session" />
          <div className="prog-trend-ends">
            <span>earlier</span>
            <span>latest</span>
          </div>
        </section>
      )}

      <div className="profile-grid">
        {/* schedule */}
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <span className="spot violet"><CardIcon name="calendar" /></span>
              <h2>Schedule</h2>
            </div>
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
            <div className="card-title">
              <span className="spot mint"><CardIcon name="users" /></span>
              <h2>Roster</h2>
            </div>
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

          {canEdit && addable.length > 0 && (
            <div className="roster-add">
              <AddParticipantForm
                action={enrollParticipant}
                programId={program.id}
                participants={addable.map((p) => ({
                  id: p.id,
                  name: `${p.first_name} ${p.last_name}`,
                }))}
                full={full}
              />
            </div>
          )}
        </section>

        {/* waitlist */}
        {waitlist.length > 0 && (
          <section className="card">
            <div className="card-head">
              <div className="card-title">
                <span className="spot amber"><CardIcon name="clock" /></span>
                <h2>Waitlist</h2>
              </div>
              <span className="card-sub">{waitlist.length} waiting</span>
            </div>
            <ol className="prog-waitlist">
              {waitlist.map((e, i) => (
                <li key={e.id} className="wl-row">
                  <span className="wl-pos num">{i + 1}</span>
                  <Link href={`/participants/${e.participants!.id}`} className="roster-name">
                    {e.participants!.first_name} {e.participants!.last_name}
                  </Link>
                  <span className="pr-grade">Gr {e.participants!.grade ?? "—"}</span>
                  {canEdit && (
                    <form action={promoteFromWaitlist} className="wl-promote">
                      <input type="hidden" name="enrollmentId" value={e.id} />
                      <input type="hidden" name="programId" value={program.id} />
                      <button className="mini-btn" type="submit" disabled={full}>
                        Promote
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ol>
            {full && (
              <p className="empty">Program is at capacity — withdraw an enrolled participant to open a seat.</p>
            )}
          </section>
        )}
      </div>

      {canDelete && (
        <section className="card program-danger">
          <div>
            <h2>Delete program</h2>
            <p>Removes this program and everything tied to it. There&rsquo;s no undo.</p>
          </div>
          <DeleteProgramButton
            programId={program.id}
            programName={program.name}
            sessions={sessions.length}
            enrolled={roster.length}
          />
        </section>
      )}
    </main>
  );
}
