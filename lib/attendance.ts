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
    .eq("status", "scheduled");

  return { ok: true, saved: rows.length };
}
