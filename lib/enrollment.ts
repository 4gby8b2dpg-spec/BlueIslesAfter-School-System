import type { SupabaseClient } from "@supabase/supabase-js";

export type Promoted = { id: string; name: string };

const today = () => new Date().toISOString().slice(0, 10);

// Fill any open seats in a capped program from the waitlist, lowest position
// first (FR-B.4). Returns who was promoted so the caller can audit-log it.
// A no-op for uncapped programs or when no seats are free / nobody is waiting.
export async function autoPromoteWaitlist(
  supabase: SupabaseClient,
  orgId: string,
  programId: string,
): Promise<Promoted[]> {
  const { data: prog } = await supabase
    .from("programs")
    .select("capacity")
    .eq("id", programId)
    .eq("org_id", orgId)
    .maybeSingle();
  const capacity = (prog?.capacity as number | null) ?? 0;
  if (capacity <= 0) return []; // uncapped: no waitlist to promote from

  const { count: enrolledCount } = await supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("program_id", programId)
    .eq("status", "enrolled");
  const seats = capacity - (enrolledCount ?? 0);
  if (seats <= 0) return [];

  const { data: waiting } = await supabase
    .from("enrollments")
    .select("id, participants(first_name, last_name)")
    .eq("org_id", orgId)
    .eq("program_id", programId)
    .eq("status", "waitlisted")
    .order("waitlist_position", { ascending: true })
    .limit(seats);

  const promoted: Promoted[] = [];
  for (const w of waiting ?? []) {
    // Guard on status so two concurrent promotions can't double-fill a seat.
    const { data: updated } = await supabase
      .from("enrollments")
      .update({
        status: "enrolled",
        enrolled_on: today(),
        waitlist_position: null,
        source: "waitlist_promo",
      })
      .eq("id", w.id)
      .eq("org_id", orgId)
      .eq("status", "waitlisted")
      .select("id")
      .maybeSingle();
    if (!updated) continue;
    const p = Array.isArray(w.participants) ? w.participants[0] : w.participants;
    const name = p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "A participant";
    promoted.push({ id: w.id as string, name });
  }
  return promoted;
}
