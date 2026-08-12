import type { SupabaseClient } from "@supabase/supabase-js";

// A deliberately small, fixed metric set for the narrative builder (FR-H.4) —
// not the full Explorer matrix (app/(app)/analytics/page.tsx). Org-wide only
// (no per-program/site/grade breakdown), since a board-deck narrative wants a
// single headline number or trend, not a dimension table.

export const NARRATIVE_METRICS = [
  { key: "attendance_rate", label: "Attendance rate", unit: "%" },
  { key: "unduplicated", label: "Unduplicated participants served", unit: "" },
  { key: "sessions_held", label: "Sessions held", unit: "" },
  { key: "avg_daily", label: "Avg daily attendance", unit: "" },
  { key: "enrolled", label: "Currently enrolled", unit: "" },
] as const;

export type NarrativeMetricKey = (typeof NARRATIVE_METRICS)[number]["key"];

export function isNarrativeMetricKey(v: unknown): v is NarrativeMetricKey {
  return typeof v === "string" && NARRATIVE_METRICS.some((m) => m.key === v);
}

const attended = (s: string) => s === "present" || s === "late";
const WEEK_MS = 7 * 86_400_000;

async function loadWindow(supabase: SupabaseClient, orgId: string, from: string, to: string) {
  const fromTs = new Date(`${from}T00:00:00`).toISOString();
  const toTs = new Date(`${to}T23:59:59`).toISOString();

  const [enrollRes, sessionsRes] = await Promise.all([
    supabase.from("enrollments").select("status").eq("org_id", orgId),
    supabase
      .from("sessions")
      .select("id, status, starts_at")
      .eq("org_id", orgId)
      .gte("starts_at", fromTs)
      .lte("starts_at", toTs),
  ]);

  const enrollments = enrollRes.data ?? [];
  const sessions = (sessionsRes.data ?? []) as { id: string; status: string; starts_at: string }[];
  const sessionIds = sessions.map((s) => s.id);

  let attendance: { session_id: string; participant_id: string; status: string }[] = [];
  if (sessionIds.length) {
    const { data } = await supabase
      .from("attendance_records")
      .select("session_id, participant_id, status")
      .eq("org_id", orgId)
      .in("session_id", sessionIds);
    attendance = data ?? [];
  }

  return { enrollments, sessions, attendance };
}

/** A single headline number for the KPI block, frozen into the narrative at add-time. */
export async function getKpiSnapshot(
  supabase: SupabaseClient,
  orgId: string,
  metric: NarrativeMetricKey,
  from: string,
  to: string,
): Promise<{ label: string; value: string }> {
  const def = NARRATIVE_METRICS.find((m) => m.key === metric)!;
  const { enrollments, sessions, attendance } = await loadWindow(supabase, orgId, from, to);

  if (metric === "enrolled") {
    const n = enrollments.filter((e) => e.status === "enrolled").length;
    return { label: def.label, value: String(n) };
  }
  if (metric === "sessions_held") {
    const n = sessions.filter((s) => s.status === "completed").length;
    return { label: def.label, value: String(n) };
  }
  if (metric === "unduplicated") {
    const set = new Set(attendance.filter((a) => attended(a.status)).map((a) => a.participant_id));
    return { label: def.label, value: String(set.size) };
  }
  if (metric === "attendance_rate") {
    let pres = 0;
    let tot = 0;
    for (const a of attendance) {
      if (attended(a.status)) {
        pres++;
        tot++;
      } else if (a.status === "absent") tot++;
    }
    const rate = tot > 0 ? Math.round((pres / tot) * 100) : 0;
    return { label: def.label, value: `${rate}%` };
  }
  // avg_daily
  const perSession = new Map<string, number>();
  for (const a of attendance) {
    if (attended(a.status)) perSession.set(a.session_id, (perSession.get(a.session_id) ?? 0) + 1);
  }
  const completed = sessions.filter((s) => s.status === "completed");
  const sum = completed.reduce((acc, s) => acc + (perSession.get(s.id) ?? 0), 0);
  const avg = completed.length > 0 ? Math.round((sum / completed.length) * 10) / 10 : 0;
  return { label: def.label, value: String(avg) };
}

/** Weekly org-wide trend for the chart block's live preview before capture. */
export async function getChartSeries(
  supabase: SupabaseClient,
  orgId: string,
  metric: NarrativeMetricKey,
  from: string,
  to: string,
): Promise<{ label: string; points: (number | null)[] }> {
  const def = NARRATIVE_METRICS.find((m) => m.key === metric)!;
  if (metric === "enrolled") return { label: def.label, points: [] }; // snapshot, not a trend

  const { sessions, attendance } = await loadWindow(supabase, orgId, from, to);
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T23:59:59`);
  const n = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / WEEK_MS));
  const weekOf = (isoTs: string) => {
    const idx = Math.floor((new Date(isoTs).getTime() - fromDate.getTime()) / WEEK_MS);
    return Math.min(Math.max(idx, 0), n - 1);
  };
  const sessionWeek = new Map(sessions.map((s) => [s.id, weekOf(s.starts_at)]));

  const att = Array.from({ length: n }, () => ({ pres: 0, tot: 0 }));
  const held = new Array(n).fill(0);
  const uniq = Array.from({ length: n }, () => new Set<string>());
  const daily = Array.from({ length: n }, () => ({ sum: 0, n: 0 }));
  const perSession = new Map<string, number>();

  for (const s of sessions) {
    if (s.status === "completed") held[sessionWeek.get(s.id)!]++;
  }
  for (const a of attendance) {
    const wk = sessionWeek.get(a.session_id);
    if (wk == null) continue;
    if (metric === "attendance_rate") {
      if (attended(a.status)) {
        att[wk].pres++;
        att[wk].tot++;
      } else if (a.status === "absent") att[wk].tot++;
    } else if (attended(a.status)) {
      uniq[wk].add(a.participant_id);
      perSession.set(a.session_id, (perSession.get(a.session_id) ?? 0) + 1);
    }
  }
  if (metric === "avg_daily") {
    for (const s of sessions) {
      if (s.status !== "completed") continue;
      const wk = sessionWeek.get(s.id)!;
      daily[wk].sum += perSession.get(s.id) ?? 0;
      daily[wk].n++;
    }
  }

  const points = Array.from({ length: n }, (_, i): number | null => {
    if (metric === "attendance_rate") {
      const { pres, tot } = att[i];
      return tot === 0 ? null : Math.round((pres / tot) * 100);
    }
    if (metric === "sessions_held") return held[i];
    if (metric === "unduplicated") return uniq[i].size;
    // avg_daily
    return daily[i].n > 0 ? Math.round((daily[i].sum / daily[i].n) * 10) / 10 : null;
  });

  return { label: def.label, points };
}
