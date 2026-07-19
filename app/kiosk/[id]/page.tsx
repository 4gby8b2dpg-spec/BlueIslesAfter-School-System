import { notFound } from "next/navigation";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { KioskCheckin } from "@/components/kiosk-checkin";
import type { Status } from "@/lib/attendance";
import "../../(app)/app.css";
import "../kiosk.css";

export const dynamic = "force-dynamic";

export default async function KioskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, starts_at, room, program_id, programs(name)")
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

  const initial: Record<string, Status> = {};
  for (const a of attRes.data ?? []) initial[a.participant_id] = a.status as Status;

  const when = new Date(session.starts_at).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const subtitle = `${when} · ${session.room ?? "—"}`;

  if (roster.length === 0) {
    return (
      <div className="kiosk">
        <header className="kiosk-head">
          <div className="kiosk-title">
            <h1>{prog?.name ?? "Session"}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="kiosk-status">
            <a href={`/attendance/${id}`} className="kiosk-exit">
              Exit
            </a>
          </div>
        </header>
        <p className="kiosk-empty">No participants are enrolled in this program yet.</p>
      </div>
    );
  }

  return (
    <KioskCheckin
      sessionId={id}
      title={prog?.name ?? "Session"}
      subtitle={subtitle}
      roster={roster}
      initial={initial}
    />
  );
}
