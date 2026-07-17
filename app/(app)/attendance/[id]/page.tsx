import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { CheckInRoster } from "@/components/checkin-roster";
import "../attendance.css";

export const dynamic = "force-dynamic";

export default async function CheckInPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, starts_at, ends_at, room, program_id, status, programs(name)")
    .eq("org_id", ctx.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!session) notFound();

  const prog = session.programs as unknown as { name: string } | null;

  const [enrollRes, attRes] = await Promise.all([
    supabase
      .from("enrollments")
      .select("participant_id, participants(first_name, last_name, grade)")
      .eq("org_id", ctx.orgId)
      .eq("program_id", session.program_id)
      .eq("status", "enrolled"),
    supabase
      .from("attendance_records")
      .select("participant_id, status")
      .eq("org_id", ctx.orgId)
      .eq("session_id", id),
  ]);

  const roster = (enrollRes.data ?? [])
    .map((e) => {
      const p = e.participants as unknown as {
        first_name: string;
        last_name: string;
        grade: string | null;
      } | null;
      return {
        id: e.participant_id as string,
        name: p ? `${p.first_name} ${p.last_name}` : "—",
        grade: p?.grade ?? "—",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const initial: Record<string, string> = {};
  for (const a of attRes.data ?? []) initial[a.participant_id] = a.status;

  const when = new Date(session.starts_at).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <main className="dash checkin-page">
      <div className="profile-back">
        <Link href="/attendance">← Back to attendance</Link>
      </div>

      <div className="checkin-head">
        <h1>{prog?.name ?? "Session"}</h1>
        <p>
          {when} · {session.room ?? "—"}
        </p>
      </div>

      {roster.length === 0 ? (
        <section className="card">
          <p className="empty">
            No participants are enrolled in this program yet. Enroll participants
            first, then take attendance.
          </p>
        </section>
      ) : (
        <CheckInRoster sessionId={session.id} roster={roster} initial={initial} />
      )}
    </main>
  );
}
