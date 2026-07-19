import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { persistAttendance, isStatus, type AttendanceMark } from "@/lib/attendance";
import { revalidatePath } from "next/cache";

// Offline-sync endpoint for the kiosk. The kiosk queues marks locally and flushes
// them here when the network is back. Idempotent (upsert), so retries are safe.
export async function POST(req: Request) {
  const ctx = await getAppContext();
  if (!ctx) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }
  if (!["admin", "director", "staff"].includes(ctx.role)) {
    return NextResponse.json({ ok: false, error: "No permission." }, { status: 403 });
  }

  let body: { sessionId?: unknown; records?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request." }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId || !Array.isArray(body.records)) {
    return NextResponse.json({ ok: false, error: "Missing sessionId or records." }, { status: 400 });
  }

  const records: AttendanceMark[] = (body.records as unknown[])
    .filter(
      (r): r is { participantId: string; status: string } =>
        !!r &&
        typeof (r as { participantId?: unknown }).participantId === "string" &&
        isStatus((r as { status?: unknown }).status),
    )
    .map((r) => ({ participantId: r.participantId, status: r.status as AttendanceMark["status"] }));

  if (records.length === 0) {
    return NextResponse.json({ ok: false, error: "No valid records." }, { status: 400 });
  }

  const supabase = await createClient();
  const res = await persistAttendance(supabase, ctx.orgId, ctx.userId, sessionId, records, "kiosk");
  if (!res.ok) return NextResponse.json(res, { status: 400 });

  revalidatePath("/attendance");
  revalidatePath(`/attendance/${sessionId}`);
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  return NextResponse.json(res, { status: 200 });
}
