/**
 * Derived alert engine (blueprint Module G / flags).
 *
 * Flags are computed live from attendance + staffing data — nothing is
 * persisted. That keeps them always-accurate with no cron and no dedup
 * problems. If a dismiss/acknowledge workflow is ever needed, materialize
 * these into the `flags` table on top of this engine.
 *
 * Definitions:
 *  - Chronic absence: absent ÷ (present + late + absent) over the current term.
 *    Tier 2 (warning) ≥ 10%, Tier 3 (critical) ≥ 20% — the field standard
 *    (Attendance Works / U.S. Dept. of Education). `late` counts as attended
 *    and `excused` is excluded from the denominator, matching lib/metrics.ts.
 *    Requires a minimum sample so a single early absence can't flag.
 *  - Ratio breach: present participants ÷ assigned staff vs the program's
 *    ratio_target, evaluated per completed session in the window.
 */

import { createClient } from "@/lib/supabase/server";

export type FlagSeverity = "info" | "warning" | "critical";

export type ComputedFlag = {
  type: "chronic_absence" | "ratio_breach";
  severity: FlagSeverity;
  participantId?: string;
  participantName?: string;
  programId?: string;
  programName?: string;
  sessionId?: string;
  when?: string; // ISO — session time for ratio breaches
  detail: string; // human-readable summary
  value: number; // the driving metric, for sorting within a severity
};

// Code defaults — used when an org hasn't customized its thresholds (0006).
export const CHRONIC = { tier2Pct: 10, tier3Pct: 20, minSessions: 5 } as const;
export const RATIO = { criticalMultiplier: 1.5 } as const;

export type FlagThresholds = {
  warningPct: number;
  criticalPct: number;
  minSessions: number;
  ratioDefaultTarget: number | null;
};

async function fetchThresholds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
): Promise<FlagThresholds> {
  const { data } = await supabase
    .from("org_settings")
    .select("chronic_warning_pct, chronic_critical_pct, chronic_min_sessions, ratio_default_target")
    .eq("org_id", orgId)
    .maybeSingle();
  return {
    warningPct: data?.chronic_warning_pct ?? CHRONIC.tier2Pct,
    criticalPct: data?.chronic_critical_pct ?? CHRONIC.tier3Pct,
    minSessions: data?.chronic_min_sessions ?? CHRONIC.minSessions,
    ratioDefaultTarget: data?.ratio_default_target ?? null,
  };
}

/** Public: an org's flag thresholds (or code defaults). For the Settings screen. */
export async function getFlagThresholds(orgId: string): Promise<FlagThresholds> {
  const supabase = await createClient();
  return fetchThresholds(supabase, orgId);
}

const DAY = 86_400_000;
const SEVERITY_RANK: Record<FlagSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Current term window for the org, or a trailing-12-week fallback. */
async function termWindow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
): Promise<{ start: Date; end: Date }> {
  const now = new Date();
  const { data } = await supabase
    .from("terms")
    .select("starts_on, ends_on")
    .eq("org_id", orgId)
    .lte("starts_on", now.toISOString())
    .gte("ends_on", now.toISOString())
    .order("starts_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.starts_on && data?.ends_on) {
    return { start: new Date(data.starts_on), end: new Date(data.ends_on) };
  }
  return { start: new Date(now.getTime() - 84 * DAY), end: now };
}

/** Public wrapper: current term window (or trailing-12-week fallback) for an org. */
export async function getTermWindow(orgId: string): Promise<{ start: Date; end: Date }> {
  const supabase = await createClient();
  return termWindow(supabase, orgId);
}

function chronicSeverity(pct: number, t: FlagThresholds): FlagSeverity | null {
  if (pct >= t.criticalPct) return "critical";
  if (pct >= t.warningPct) return "warning";
  return null;
}

/**
 * Chronic-absence flags across the org. One flag per at-risk participant.
 * Pass `participantId` to scope to a single participant (profile screen).
 */
export async function computeChronicAbsence(
  orgId: string,
  participantId?: string,
): Promise<ComputedFlag[]> {
  const supabase = await createClient();
  const [{ start, end }, thresholds] = await Promise.all([
    termWindow(supabase, orgId),
    fetchThresholds(supabase, orgId),
  ]);

  let q = supabase
    .from("attendance_records")
    .select("status, participant_id, participants(first_name, last_name), sessions!inner(starts_at)")
    .eq("org_id", orgId)
    .gte("sessions.starts_at", start.toISOString())
    .lte("sessions.starts_at", end.toISOString());
  if (participantId) q = q.eq("participant_id", participantId);

  const { data } = await q;
  const rows = (data ?? []) as unknown as {
    status: string;
    participant_id: string;
    participants: { first_name: string | null; last_name: string | null } | null;
  }[];

  type Acc = { name: string; present: number; absent: number };
  const byP = new Map<string, Acc>();
  for (const r of rows) {
    const acc =
      byP.get(r.participant_id) ??
      {
        name: `${r.participants?.first_name ?? ""} ${r.participants?.last_name ?? ""}`.trim() || "Participant",
        present: 0,
        absent: 0,
      };
    if (r.status === "present" || r.status === "late") acc.present++;
    else if (r.status === "absent") acc.absent++;
    // excused is intentionally excluded from the denominator
    byP.set(r.participant_id, acc);
  }

  const flags: ComputedFlag[] = [];
  for (const [pid, a] of byP) {
    const denom = a.present + a.absent;
    if (denom < thresholds.minSessions) continue;
    const pct = (a.absent / denom) * 100;
    const severity = chronicSeverity(pct, thresholds);
    if (!severity) continue;
    flags.push({
      type: "chronic_absence",
      severity,
      participantId: pid,
      participantName: a.name,
      value: pct,
      detail: `${Math.round(pct)}% absent (${a.absent} of ${denom} sessions)`,
    });
  }
  return flags;
}

/**
 * Staff-ratio breaches across completed sessions in the term window.
 * Only programs with a ratio_target set are evaluated.
 */
export async function computeRatioBreaches(orgId: string): Promise<ComputedFlag[]> {
  const supabase = await createClient();
  const [{ start, end }, thresholds] = await Promise.all([
    termWindow(supabase, orgId),
    fetchThresholds(supabase, orgId),
  ]);

  const [sessionsRes, attRes, staffRes, programsRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, program_id, starts_at, status")
      .eq("org_id", orgId)
      .eq("status", "completed")
      .gte("starts_at", start.toISOString())
      .lte("starts_at", end.toISOString()),
    supabase.from("attendance_records").select("session_id, status").eq("org_id", orgId),
    supabase.from("session_staff").select("session_id").eq("org_id", orgId),
    supabase.from("programs").select("id, name, ratio_target").eq("org_id", orgId),
  ]);

  const sessions = sessionsRes.data ?? [];
  const staffRows = staffRes.data ?? [];
  // If the org records no staffing at all, ratio can't be judged — a session with
  // attendance but zero staff rows means "unrecorded", not a 22:0 breach. Suppress
  // rather than flood the dashboard with false positives.
  if (staffRows.length === 0) return [];

  const program = new Map(
    (programsRes.data ?? []).map((p) => [p.id, { name: p.name, target: p.ratio_target }]),
  );
  const presentBySession = new Map<string, number>();
  for (const a of attRes.data ?? []) {
    if (a.status === "present" || a.status === "late")
      presentBySession.set(a.session_id, (presentBySession.get(a.session_id) ?? 0) + 1);
  }
  const staffBySession = new Map<string, number>();
  for (const s of staffRows)
    staffBySession.set(s.session_id, (staffBySession.get(s.session_id) ?? 0) + 1);

  const flags: ComputedFlag[] = [];
  for (const s of sessions) {
    const prog = program.get(s.program_id);
    // Use the program's own target, or the org-wide default when it has none.
    const target = prog?.target ?? thresholds.ratioDefaultTarget;
    if (!target || target <= 0) continue; // no target anywhere → nothing to breach
    const present = presentBySession.get(s.id) ?? 0;
    const staff = staffBySession.get(s.id) ?? 0;
    if (present === 0) continue;
    // With no staff assigned, any attendance is a breach; otherwise compare the ratio.
    const ratio = staff === 0 ? Infinity : present / staff;
    if (ratio <= target) continue;
    const severity: FlagSeverity =
      staff === 0 || ratio >= target * RATIO.criticalMultiplier ? "critical" : "warning";
    const ratioLabel = staff === 0 ? `${present} present, no staff assigned` : `${present}:${staff} vs target ${target}:1`;
    flags.push({
      type: "ratio_breach",
      severity,
      programId: s.program_id,
      programName: prog?.name,
      sessionId: s.id,
      when: s.starts_at,
      value: staff === 0 ? present : ratio,
      detail: ratioLabel,
    });
  }
  return flags;
}

function sortFlags(flags: ComputedFlag[]): ComputedFlag[] {
  return flags.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.value - a.value,
  );
}

/** All computed flags for the org, most severe first. */
export async function getOrgFlags(orgId: string): Promise<ComputedFlag[]> {
  const [chronic, ratio] = await Promise.all([
    computeChronicAbsence(orgId),
    computeRatioBreaches(orgId),
  ]);
  return sortFlags([...chronic, ...ratio]);
}

/** Chronic-absence flag for a single participant, if any (profile screen). */
export async function getParticipantFlag(
  orgId: string,
  participantId: string,
): Promise<ComputedFlag | null> {
  const flags = await computeChronicAbsence(orgId, participantId);
  return flags[0] ?? null;
}

export const FLAG_LABEL: Record<ComputedFlag["type"], string> = {
  chronic_absence: "Chronic absence",
  ratio_breach: "Staff ratio breach",
};
