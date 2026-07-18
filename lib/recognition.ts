/**
 * Derived recognition / badge engine (Phase 2).
 *
 * Badges are computed live from attendance + enrollment data — nothing is
 * persisted, mirroring lib/flags.ts. The design is deliberately equity-aware:
 * we do NOT reward "perfect attendance" (widely criticized as inequitable and
 * discouraged by the CDC — it punishes sick/disabled kids and drives
 * presenteeism). Instead we reward effort, improvement, and consistency —
 * milestones everyone can reach regardless of their starting point:
 *   - Milestones: cumulative sessions attended (10/25/50/100), all-time.
 *   - Consistent: ≥90% attendance over the current term (not "perfect").
 *   - Streak: consecutive attended sessions where an EXCUSED absence does not
 *     break the run — showing up is rewarded without punishing legitimate absence.
 *   - Most Improved: attendance rate up meaningfully vs the prior period — the
 *     badge that reaches kids a perfect-attendance scheme would ignore.
 *   - Well-Rounded: engaged across multiple programs.
 */

import { createClient } from "@/lib/supabase/server";
import { getTermWindow } from "@/lib/flags";

export type BadgeKind = "milestone" | "consistency" | "streak" | "improvement" | "engagement";

export type Badge = {
  key: string; // stable id, unique within a participant
  kind: BadgeKind;
  label: string; // short display name
  detail: string; // one-line explanation
  emoji: string;
};

const MILESTONES = [
  { n: 100, emoji: "🏆", label: "100 Sessions" },
  { n: 50, emoji: "🥇", label: "50 Sessions" },
  { n: 25, emoji: "🥈", label: "25 Sessions" },
  { n: 10, emoji: "🥉", label: "10 Sessions" },
] as const;

export const RECOGNITION = {
  consistencyPct: 90,
  consistencyMinSessions: 8,
  streakMin: 5,
  improvementMinDelta: 10,
  improvementMinSessions: 6,
  engagementMinPrograms: 2,
} as const;

const KIND_RANK: Record<BadgeKind, number> = {
  milestone: 0,
  improvement: 1,
  streak: 2,
  consistency: 3,
  engagement: 4,
};

type Rec = { status: string; at: number }; // at = session start (ms)

function attended(status: string): boolean {
  return status === "present" || status === "late";
}

function sortBadges(badges: Badge[]): Badge[] {
  return badges.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
}

/**
 * Pure badge computation from a participant's attendance records.
 * `window` is the current term (ms); milestones use all-time totals.
 */
export function badgesFromRecords(
  records: Rec[],
  window: { start: number; end: number },
): Badge[] {
  const badges: Badge[] = [];
  const sorted = [...records].sort((a, b) => a.at - b.at);

  // --- Milestone (all-time cumulative, highest reached) ---
  const attendedAllTime = sorted.filter((r) => attended(r.status)).length;
  const m = MILESTONES.find((x) => attendedAllTime >= x.n);
  if (m) {
    badges.push({
      key: `milestone_${m.n}`,
      kind: "milestone",
      label: m.label,
      emoji: m.emoji,
      detail: `${attendedAllTime} sessions attended`,
    });
  }

  // --- Term-scoped rate (consistency) ---
  const term = sorted.filter((r) => r.at >= window.start && r.at <= window.end);
  const termPres = term.filter((r) => attended(r.status)).length;
  const termAbs = term.filter((r) => r.status === "absent").length;
  const termDenom = termPres + termAbs;
  if (termDenom >= RECOGNITION.consistencyMinSessions) {
    const pct = (termPres / termDenom) * 100;
    if (pct >= RECOGNITION.consistencyPct) {
      badges.push({
        key: "consistency",
        kind: "consistency",
        label: "Consistent",
        emoji: "🎯",
        detail: `${Math.round(pct)}% attendance this term`,
      });
    }
  }

  // --- Streak (most recent backward; excused skipped; absent breaks) ---
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i].status;
    if (s === "excused") continue; // legitimate absence doesn't break the run
    if (attended(s)) streak++;
    else break;
  }
  if (streak >= RECOGNITION.streakMin) {
    badges.push({
      key: "streak",
      kind: "streak",
      label: `${streak}-Session Streak`,
      emoji: "🔥",
      detail: `${streak} attended in a row`,
    });
  }

  // --- Most Improved (current term vs prior equal-length period) ---
  const len = window.end - window.start;
  const prior = sorted.filter((r) => r.at >= window.start - len && r.at < window.start);
  const priorPres = prior.filter((r) => attended(r.status)).length;
  const priorAbs = prior.filter((r) => r.status === "absent").length;
  const priorDenom = priorPres + priorAbs;
  if (
    termDenom >= RECOGNITION.improvementMinSessions &&
    priorDenom >= RECOGNITION.improvementMinSessions
  ) {
    const delta = (termPres / termDenom) * 100 - (priorPres / priorDenom) * 100;
    if (delta >= RECOGNITION.improvementMinDelta) {
      badges.push({
        key: "improvement",
        kind: "improvement",
        label: "Most Improved",
        emoji: "📈",
        detail: `+${Math.round(delta)} pts vs last period`,
      });
    }
  }

  return badges;
}

type AttendanceRow = {
  status: string;
  participant_id: string;
  sessions: { starts_at: string } | null;
};

/** Badges for a single participant (profile screen). */
export async function getParticipantBadges(
  orgId: string,
  participantId: string,
): Promise<Badge[]> {
  const supabase = await createClient();
  const window = await getTermWindow(orgId);
  const [attRes, enrRes] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("status, participant_id, sessions!inner(starts_at)")
      .eq("org_id", orgId)
      .eq("participant_id", participantId),
    supabase
      .from("enrollments")
      .select("status")
      .eq("org_id", orgId)
      .eq("participant_id", participantId),
  ]);

  const rows = (attRes.data ?? []) as unknown as AttendanceRow[];
  const records: Rec[] = rows
    .filter((r) => r.sessions?.starts_at)
    .map((r) => ({ status: r.status, at: new Date(r.sessions!.starts_at).getTime() }));

  const badges = badgesFromRecords(records, {
    start: window.start.getTime(),
    end: window.end.getTime(),
  });

  const activePrograms = (enrRes.data ?? []).filter((e) => e.status === "enrolled").length;
  if (activePrograms >= RECOGNITION.engagementMinPrograms) {
    badges.push({
      key: "engagement",
      kind: "engagement",
      label: "Well-Rounded",
      emoji: "🌟",
      detail: `Active in ${activePrograms} programs`,
    });
  }

  return sortBadges(badges);
}

export type BoardEntry = {
  participantId: string;
  name: string;
  badges: Badge[];
};

/** Recognition board: every participant who has earned at least one badge. */
export async function getRecognitionBoard(orgId: string): Promise<BoardEntry[]> {
  const supabase = await createClient();
  const window = await getTermWindow(orgId);
  const win = { start: window.start.getTime(), end: window.end.getTime() };

  const [attRes, enrRes, partRes] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("status, participant_id, sessions!inner(starts_at)")
      .eq("org_id", orgId),
    supabase.from("enrollments").select("participant_id, status").eq("org_id", orgId),
    supabase
      .from("participants")
      .select("id, first_name, last_name")
      .eq("org_id", orgId)
      .is("deleted_at", null),
  ]);

  const rows = (attRes.data ?? []) as unknown as AttendanceRow[];
  const byParticipant = new Map<string, Rec[]>();
  for (const r of rows) {
    if (!r.sessions?.starts_at) continue;
    const arr = byParticipant.get(r.participant_id) ?? [];
    arr.push({ status: r.status, at: new Date(r.sessions.starts_at).getTime() });
    byParticipant.set(r.participant_id, arr);
  }

  const activePrograms = new Map<string, number>();
  for (const e of enrRes.data ?? []) {
    if (e.status === "enrolled")
      activePrograms.set(e.participant_id, (activePrograms.get(e.participant_id) ?? 0) + 1);
  }

  const name = new Map(
    (partRes.data ?? []).map((p) => [
      p.id,
      `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Participant",
    ]),
  );

  const entries: BoardEntry[] = [];
  for (const [pid, records] of byParticipant) {
    const badges = badgesFromRecords(records, win);
    const programs = activePrograms.get(pid) ?? 0;
    if (programs >= RECOGNITION.engagementMinPrograms) {
      badges.push({
        key: "engagement",
        kind: "engagement",
        label: "Well-Rounded",
        emoji: "🌟",
        detail: `Active in ${programs} programs`,
      });
    }
    if (badges.length === 0) continue;
    entries.push({ participantId: pid, name: name.get(pid) ?? "Participant", badges: sortBadges(badges) });
  }

  // Most-decorated first, then by highest milestone, then name.
  return entries.sort(
    (a, b) =>
      b.badges.length - a.badges.length ||
      milestoneValue(b.badges) - milestoneValue(a.badges) ||
      a.name.localeCompare(b.name),
  );
}

function milestoneValue(badges: Badge[]): number {
  const m = badges.find((b) => b.kind === "milestone");
  return m ? Number(m.key.replace("milestone_", "")) : 0;
}
