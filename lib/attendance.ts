import { createClient } from "@/lib/supabase/server";

// Shared attendance persistence — used by both the roster server action and the
// kiosk offline-sync route so they can never drift. Upsert is idempotent on
// (session_id, participant_id), so replaying a queued batch is always safe.
export type Status = "present" | "absent" | "excused" | "late";
export type AttendanceMark = { participantId: string; status: Status };

type DB = Awaited<ReturnType<typeof createClient>>;

const VALID: ReadonlySet<string> = new Set(["present", "absent", "excused", "late"]);

export function isStatus(v: unknown): v is Status {
  return typeof v === "string" && VALID.has(v);
}

export async function persistAttendance(
  supabase: DB,
  orgId: string,
  userId: string,
  sessionId: string,
  records: AttendanceMark[],
  source: "roster" | "kiosk" = "roster",
): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  if (records.length === 0) return { ok: false, error: "Nothing to save." };
  if (records.length > 500) return { ok: false, error: "Too many records in one request." };

  const participantIds = [...new Set(records.map((record) => record.participantId))];
  if (participantIds.length !== records.length) {
    return { ok: false, error: "Duplicate participant records are not allowed." };
  }

  const { data: session } = await supabase
    .from("sessions")
    .select("id, program_id, attendance_locked")
    .eq("id", sessionId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!session) return { ok: false, error: "Session not found." };
  if (session.attendance_locked) return { ok: false, error: "Attendance is locked for this session." };

  const { data: enrolled } = await supabase
    .from("enrollments")
    .select("participant_id")
    .eq("org_id", orgId)
    .eq("program_id", session.program_id)
    .in("participant_id", participantIds)
    .in("status", ["enrolled", "completed"]);
  const enrolledIds = new Set((enrolled ?? []).map((row) => row.participant_id));
  if (participantIds.some((id) => !enrolledIds.has(id))) {
    return { ok: false, error: "One or more participants are not enrolled in this program." };
  }

  const rows = records.map((r) => ({
    org_id: orgId,
    session_id: sessionId,
    participant_id: r.participantId,
    status: r.status,
    recorded_by: userId,
    source,
  }));

  const { error } = await supabase
    .from("attendance_records")
    .upsert(rows, { onConflict: "session_id,participant_id" });
  if (error) return { ok: false, error: error.message };

  // Once attendance is taken, the session has happened.
  await supabase
    .from("sessions")
    .update({ status: "completed" })
    .eq("id", sessionId)
    .eq("org_id", orgId)
    .eq("status", "scheduled");

  return { ok: true, saved: rows.length };
}
