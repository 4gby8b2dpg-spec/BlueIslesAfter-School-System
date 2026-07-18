import { createClient } from "@/lib/supabase/server";
import { getOrgFlags, FLAG_LABEL } from "@/lib/flags";

// Live dashboard data (blueprint §5). All reads run through RLS as the signed-in
// user, so this only ever returns the caller's org data.

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

const DAY = 86_400_000;

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

export async function getDashboardData(orgId: string) {
  const supabase = await createClient();
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + DAY);
  const trendStart = new Date(now.getTime() - 56 * DAY); // 8 weeks

  const [programsRes, enrollmentsRes, sessionsRes, attendanceRes, flags, importsRes] =
    await Promise.all([
      supabase
        .from("programs")
        .select("id, name, category, capacity, status")
        .eq("org_id", orgId),
      supabase
        .from("enrollments")
        .select("program_id, status")
        .eq("org_id", orgId),
      supabase
        .from("sessions")
        .select("id, program_id, starts_at, ends_at, room, status")
        .eq("org_id", orgId)
        .gte("starts_at", trendStart.toISOString())
        .lte("starts_at", weekEnd.toISOString())
        .order("starts_at", { ascending: true }),
      supabase
        .from("attendance_records")
        .select("status, sessions(starts_at)")
        .eq("org_id", orgId)
        .gte("created_at", trendStart.toISOString()),
      // Derived flags — always current, computed from attendance/staffing.
      getOrgFlags(orgId),
      supabase
        .from("imports")
        .select("id, file_name, status, rows_committed, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(4),
    ]);

  const programs = programsRes.data ?? [];
  const enrollments = enrollmentsRes.data ?? [];
  const sessions = sessionsRes.data ?? [];
  const attendance = attendanceRes.data ?? [];
  const imports = importsRes.data ?? [];

  // ---- KPIs ----
  const activeEnrollment = enrollments.filter((e) => e.status === "enrolled").length;
  const activePrograms = programs.filter((p) => p.status === "active").length;
  const sessionsThisWeek = sessions.filter((s) => {
    const t = new Date(s.starts_at).getTime();
    return t >= weekStart.getTime() && t < weekEnd.getTime();
  }).length;
  const atRisk = flags.filter((f) => f.type === "chronic_absence").length;

  // attendance rate, trailing 4 weeks
  const fourWeeksAgo = now.getTime() - 28 * DAY;
  let present = 0,
    absent = 0;
  const attWithDate = attendance as unknown as {
    status: string;
    sessions: { starts_at: string } | null;
  }[];
  for (const a of attWithDate) {
    const when = a.sessions?.starts_at ? new Date(a.sessions.starts_at).getTime() : now.getTime();
    if (when < fourWeeksAgo) continue;
    if (a.status === "present" || a.status === "late") present++;
    else if (a.status === "absent") absent++;
  }
  const attRate = present + absent > 0 ? (present / (present + absent)) * 100 : null;

  // ---- weekly attendance trend (8 buckets) ----
  const buckets = Array.from({ length: 8 }, (_, i) => {
    const bStart = weekStart.getTime() - (7 - i) * 7 * DAY;
    return { start: bStart, end: bStart + 7 * DAY, pres: 0, tot: 0 };
  });
  for (const a of attWithDate) {
    const when = a.sessions?.starts_at ? new Date(a.sessions.starts_at).getTime() : null;
    if (when == null) continue;
    const b = buckets.find((x) => when >= x.start && when < x.end);
    if (!b) continue;
    if (a.status === "absent") b.tot++;
    else if (a.status === "present" || a.status === "late") {
      b.pres++;
      b.tot++;
    }
  }
  const trend = buckets.map((b) => (b.tot > 0 ? Math.round((b.pres / b.tot) * 100) : null));

  // ---- enrollment by program (with capacity) ----
  const enrollByProgram = programs
    .map((p) => ({
      name: p.name,
      category: p.category,
      capacity: p.capacity,
      count: enrollments.filter((e) => e.program_id === p.id && e.status === "enrolled").length,
    }))
    .sort((a, b) => b.count - a.count);

  // ---- today's schedule ----
  const programName = new Map(programs.map((p) => [p.id, p.name]));
  const today = sessions
    .filter((s) => {
      const t = new Date(s.starts_at).getTime();
      return t >= todayStart.getTime() && t < todayEnd.getTime();
    })
    .map((s) => ({
      time: new Date(s.starts_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
      program: programName.get(s.program_id) ?? "Session",
      room: s.room ?? "—",
    }));

  // ---- flags for the rail (subject + detail + severity) ----
  const alerts = flags.slice(0, 12).map((f, i) => ({
    id: `${f.type}-${f.participantId ?? f.sessionId ?? i}`,
    severity: f.severity,
    label: `${f.participantName ?? f.programName ?? FLAG_LABEL[f.type]} — ${FLAG_LABEL[f.type].toLowerCase()} (${f.detail})`,
    href:
      f.type === "chronic_absence" && f.participantId
        ? `/participants/${f.participantId}`
        : f.type === "ratio_breach" && f.sessionId
          ? `/attendance/${f.sessionId}`
          : undefined,
  }));

  return {
    kpis: { activeEnrollment, attRate, sessionsThisWeek, activePrograms, atRisk },
    trend,
    enrollByProgram,
    today,
    alerts,
    imports: imports.map((i) => ({
      id: i.id,
      name: i.file_name,
      status: i.status,
      rows: i.rows_committed,
    })),
  };
}
