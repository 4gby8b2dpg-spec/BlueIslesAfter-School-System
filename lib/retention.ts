import type { SupabaseClient } from "@supabase/supabase-js";

// Data retention & purge (FR-I.4). Eligibility is computed live from
// enrollments — there's no participant-level "withdrawn" status, only an
// enrollment-level one — so a participant is purge-eligible when every
// enrollment they've ever had is withdrawn/completed (none enrolled or
// waitlisted) and their most recent enrollment activity predates the org's
// configured retention window.

export type PurgeCandidate = {
  id: string;
  name: string;
  lastActivityOn: string;
};

export async function getPurgeCandidates(
  supabase: SupabaseClient,
  orgId: string,
  retentionYears: number,
): Promise<PurgeCandidate[]> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - retentionYears);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const [participantsRes, enrollmentsRes] = await Promise.all([
    supabase
      .from("participants")
      .select("id, first_name, last_name")
      .eq("org_id", orgId)
      .is("deleted_at", null),
    supabase
      .from("enrollments")
      .select("participant_id, status, enrolled_on, withdrawn_on")
      .eq("org_id", orgId),
  ]);

  const participants = participantsRes.data ?? [];
  const enrollments = enrollmentsRes.data ?? [];

  const byParticipant = new Map<
    string,
    { status: string; enrolled_on: string | null; withdrawn_on: string | null }[]
  >();
  for (const e of enrollments) {
    const list = byParticipant.get(e.participant_id) ?? [];
    list.push(e);
    byParticipant.set(e.participant_id, list);
  }

  const candidates: PurgeCandidate[] = [];
  for (const p of participants) {
    const theirs = byParticipant.get(p.id);
    if (!theirs || theirs.length === 0) continue; // never enrolled — leave alone
    if (theirs.some((e) => e.status === "enrolled" || e.status === "waitlisted")) continue;

    let lastActivityOn: string | null = null;
    for (const e of theirs) {
      const d = e.withdrawn_on ?? e.enrolled_on;
      if (d && (!lastActivityOn || d > lastActivityOn)) lastActivityOn = d;
    }
    if (!lastActivityOn || lastActivityOn >= cutoffIso) continue;

    candidates.push({
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      lastActivityOn,
    });
  }

  return candidates.sort((a, b) => a.lastActivityOn.localeCompare(b.lastActivityOn));
}
