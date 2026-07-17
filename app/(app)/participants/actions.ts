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
  // Upsert so re-enrolling a previously-withdrawn participant just flips them back.
  await supabase.from("enrollments").upsert(
    {
      org_id: ctx.orgId,
      participant_id: participantId,
      program_id: programId,
      status: "enrolled",
      enrolled_on: today(),
      withdrawn_on: null,
      source: "manual",
    },
    { onConflict: "participant_id,program_id" },
  );

  revalidatePath(`/participants/${participantId}`);
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
