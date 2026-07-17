"use server";

import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ScheduleState = { ok: boolean; error?: string; created?: number } | null;

// Generate recurring weekday sessions for a program across a date range.
// The sessions ARE the schedule — they flow into Attendance, Calendar, dashboard.
// Signature matches useActionState: (prevState, formData).
export async function createRecurringSchedule(
  _prev: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  const ctx = await requireAppContext();
  if (!["admin", "director", "staff"].includes(ctx.role)) {
    return { ok: false as const, error: "No permission to schedule." };
  }

  const programId = String(formData.get("programId") ?? "");
  const weekdays = formData.getAll("weekdays").map((v) => Number(v)); // 1=Mon … 5=Fri
  const startTime = String(formData.get("startTime") ?? "");
  const durationMin = Number(formData.get("durationMin") ?? 90) || 90;
  const room = String(formData.get("room") ?? "").trim() || null;
  const fromDate = String(formData.get("fromDate") ?? "");
  const toDate = String(formData.get("toDate") ?? "");

  if (!programId || weekdays.length === 0 || !startTime || !fromDate || !toDate) {
    return { ok: false as const, error: "Missing schedule details." };
  }

  const [hh, mm] = startTime.split(":").map(Number);
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return { ok: false as const, error: "Invalid date range." };
  }

  const rows: Record<string, unknown>[] = [];
  const recurrenceId = crypto.randomUUID();
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 400) {
    if (weekdays.includes(cursor.getDay())) {
      const s = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), hh, mm);
      const e = new Date(s.getTime() + durationMin * 60_000);
      rows.push({
        org_id: ctx.orgId,
        program_id: programId,
        starts_at: s.toISOString(),
        ends_at: e.toISOString(),
        room,
        recurrence_id: recurrenceId,
        status: "scheduled",
      });
    }
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }

  if (rows.length === 0) {
    return { ok: false as const, error: "No matching weekdays in that range." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("sessions").insert(rows);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/timetable");
  revalidatePath("/calendar");
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  return { ok: true as const, created: rows.length };
}
