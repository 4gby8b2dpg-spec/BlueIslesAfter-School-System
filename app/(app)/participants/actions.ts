"use server";

import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const today = () => new Date().toISOString().slice(0, 10);

export async function enrollParticipant(formData: FormData) {
  const ctx = await requireAppContext();
  if (!["admin", "director", "staff"].includes(ctx.role)) return;
  const participantId = String(formData.get("participantId"));
  const programId = String(formData.get("programId"));
  if (!participantId || !programId) return;

  const supabase = await createClient();

  // If the program is at capacity, the participant joins the waitlist instead.
  const { data: prog } = await supabase
    .from("programs")
    .select("capacity")
    .eq("id", programId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  const capacity = prog?.capacity ?? 0;

  let status = "enrolled";
  let waitlistPosition: number | null = null;
  if (capacity > 0) {
    const { count: enrolledCount } = await supabase
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("program_id", programId)
      .eq("status", "enrolled");
    if ((enrolledCount ?? 0) >= capacity) {
      status = "waitlisted";
      const { data: last } = await supabase
        .from("enrollments")
        .select("waitlist_position")
        .eq("org_id", ctx.orgId)
        .eq("program_id", programId)
        .eq("status", "waitlisted")
        .order("waitlist_position", { ascending: false })
        .limit(1)
        .maybeSingle();
      waitlistPosition = ((last?.waitlist_position as number | null) ?? 0) + 1;
    }
  }

  // Upsert so re-enrolling a previously-withdrawn participant just flips them back.
  await supabase.from("enrollments").upsert(
    {
      org_id: ctx.orgId,
      participant_id: participantId,
      program_id: programId,
      status,
      enrolled_on: status === "enrolled" ? today() : null,
      withdrawn_on: null,
      waitlist_position: waitlistPosition,
      source: "manual",
    },
    { onConflict: "participant_id,program_id" },
  );

  revalidatePath(`/participants/${participantId}`);
  revalidatePath(`/programs/${programId}`);
  revalidatePath("/participants");
  revalidatePath("/dashboard");
}

export async function withdrawEnrollment(formData: FormData) {
  const ctx = await requireAppContext();
  if (!["admin", "director", "staff"].includes(ctx.role)) return;
  const enrollmentId = String(formData.get("enrollmentId"));
  const participantId = String(formData.get("participantId"));
  if (!enrollmentId) return;

  const supabase = await createClient();
  await supabase
    .from("enrollments")
    .update({ status: "withdrawn", withdrawn_on: today() })
    .eq("id", enrollmentId);

  revalidatePath(`/participants/${participantId}`);
  revalidatePath("/participants");
  revalidatePath("/dashboard");
}
