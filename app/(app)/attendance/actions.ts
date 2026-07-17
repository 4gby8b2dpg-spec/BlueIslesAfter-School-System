"use server";

import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type AttendanceMark = {
  participantId: string;
  status: "present" | "absent" | "excused" | "late";
};

export async function saveAttendance(input: {
  sessionId: string;
  records: AttendanceMark[];
}) {
  const ctx = await requireAppContext();
  if (!["admin", "director", "staff"].includes(ctx.role)) {
    return { ok: false as const, error: "You don't have permission to take attendance." };
  }
  if (input.records.length === 0) {
    return { ok: false as const, error: "Nothing to save." };
  }
  const supabase = await createClient();

  const rows = input.records.map((r) => ({
    org_id: ctx.orgId,
    session_id: input.sessionId,
    participant_id: r.participantId,
    status: r.status,
    recorded_by: ctx.userId,
    source: "roster" as const,
  }));

  const { error } = await supabase
    .from("attendance_records")
    .upsert(rows, { onConflict: "session_id,participant_id" });
  if (error) return { ok: false as const, error: error.message };

  // Once attendance is taken, the session has happened.
  await supabase
    .from("sessions")
    .update({ status: "completed" })
    .eq("id", input.sessionId)
    .eq("status", "scheduled");

  revalidatePath("/attendance");
  revalidatePath(`/attendance/${input.sessionId}`);
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  return { ok: true as const, saved: rows.length };
}
