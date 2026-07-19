"use server";

import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { persistAttendance, type AttendanceMark } from "@/lib/attendance";
import { revalidatePath } from "next/cache";

export type { AttendanceMark };

export async function saveAttendance(input: {
  sessionId: string;
  records: AttendanceMark[];
}) {
  const ctx = await requireAppContext();
  if (!["admin", "director", "staff"].includes(ctx.role)) {
    return { ok: false as const, error: "You don't have permission to take attendance." };
  }
  const supabase = await createClient();
  const res = await persistAttendance(
    supabase,
    ctx.orgId,
    ctx.userId,
    input.sessionId,
    input.records,
    "roster",
  );
  if (!res.ok) return res;

  revalidatePath("/attendance");
  revalidatePath(`/attendance/${input.sessionId}`);
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  return res;
}
