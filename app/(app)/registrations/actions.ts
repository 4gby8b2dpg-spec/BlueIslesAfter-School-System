"use server";

import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

const today = () => new Date().toISOString().slice(0, 10);

type Ctx = { orgId: string; userId: string };

// Capacity-aware enrollment, mirroring participants/enrollParticipant but for a
// known participant/program pair created during approval. Waitlists when full.
async function enrollFromRegistration(
  supabase: SupabaseClient,
  ctx: Ctx,
  participantId: string,
  programId: string,
) {
  const { data: prog } = await supabase
    .from("programs")
    .select("capacity, status")
    .eq("id", programId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!prog) return; // program was deleted since submission — skip enrollment

  const capacity = (prog.capacity as number | null) ?? 0;
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

  await supabase.from("enrollments").upsert(
    {
      org_id: ctx.orgId,
      participant_id: participantId,
      program_id: programId,
      status,
      enrolled_on: status === "enrolled" ? today() : null,
      withdrawn_on: null,
      waitlist_position: waitlistPosition,
      source: "registration",
    },
    { onConflict: "participant_id,program_id" },
  );
}

// The full approval for one registration: participant + guardian + enrollment(s)
// + queue close-out + audit. Returns the enrolled program ids (for revalidation),
// or null when the row was gone / already handled / blocked.
async function approveOne(
  supabase: SupabaseClient,
  ctx: Ctx,
  registrationId: string,
): Promise<string[] | null> {
  // Re-read the row server-side (never trust the form for anything but the id),
  // and only act on a still-pending submission so double-clicks are harmless.
  const { data: reg } = await supabase
    .from("registrations")
    .select("*")
    .eq("id", registrationId)
    .eq("org_id", ctx.orgId)
    .eq("status", "pending")
    .maybeSingle();
  if (!reg) return null;

  // 1) the participant
  const { data: participant } = await supabase
    .from("participants")
    .insert({
      org_id: ctx.orgId,
      first_name: reg.child_first,
      last_name: reg.child_last,
      date_of_birth: reg.child_dob,
      grade: reg.child_grade,
      school: reg.child_school,
      photo_consent: reg.photo_consent ?? false,
    })
    .select("id")
    .single();
  if (!participant) return null; // insert blocked (RLS/constraint) — leave row pending

  // 2) the guardian + link, when the parent gave enough to identify one
  if (reg.guardian_first || reg.guardian_last || reg.guardian_phone || reg.guardian_email) {
    const { data: guardian } = await supabase
      .from("guardians")
      .insert({
        org_id: ctx.orgId,
        first_name: reg.guardian_first,
        last_name: reg.guardian_last,
        phone: reg.guardian_phone,
        email: reg.guardian_email,
        is_emergency_contact: true,
      })
      .select("id")
      .single();
    if (guardian) {
      await supabase.from("guardians_link").insert({
        org_id: ctx.orgId,
        participant_id: participant.id,
        guardian_id: guardian.id,
        relationship: reg.guardian_relationship,
      });
    }
  }

  // 3) the enrollment(s) — program_choices (0014) may carry one per weekday;
  // older rows have just program_id. Skip anything deleted since submission.
  const choices = reg.program_choices as { id: string }[] | null;
  const programIds: string[] = choices?.length
    ? choices.map((c) => c.id)
    : reg.program_id
      ? [reg.program_id as string]
      : [];
  for (const programId of programIds) {
    await enrollFromRegistration(supabase, ctx, participant.id, programId);
  }

  // 4) close out the queue row
  await supabase
    .from("registrations")
    .update({
      status: "approved",
      created_participant_id: participant.id,
      reviewed_by: ctx.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", registrationId)
    .eq("org_id", ctx.orgId)
    .eq("status", "pending");

  await supabase.from("audit_log").insert({
    org_id: ctx.orgId,
    actor_id: ctx.userId,
    action: "approve",
    entity_table: "registrations",
    entity_id: registrationId,
    before: { status: "pending" },
    after: { status: "approved", created_participant_id: participant.id },
  });

  return programIds;
}

function revalidateAfterApproval(programIds: Iterable<string>) {
  revalidatePath("/registrations");
  revalidatePath("/participants");
  for (const id of new Set(programIds)) revalidatePath(`/programs/${id}`);
  revalidatePath("/dashboard");
}

export async function approveRegistration(formData: FormData) {
  const ctx = await requireAppContext();
  if (!["admin", "director", "staff"].includes(ctx.role)) return;
  const registrationId = String(formData.get("registrationId") ?? "");
  if (!registrationId) return;

  const supabase = await createClient();
  const programIds = await approveOne(supabase, ctx, registrationId);
  revalidateAfterApproval(programIds ?? []);
}

export async function bulkApproveRegistrations(formData: FormData) {
  const ctx = await requireAppContext();
  if (!["admin", "director", "staff"].includes(ctx.role)) return;
  const ids = formData
    .getAll("ids")
    .map(String)
    .filter(Boolean)
    .slice(0, 100);
  if (ids.length === 0) return;

  const supabase = await createClient();
  const touched: string[] = [];
  for (const id of ids) {
    const programIds = await approveOne(supabase, ctx, id);
    if (programIds) touched.push(...programIds);
  }
  revalidateAfterApproval(touched);
}

export async function rejectRegistration(formData: FormData) {
  const ctx = await requireAppContext();
  if (!["admin", "director", "staff"].includes(ctx.role)) return;
  const registrationId = String(formData.get("registrationId") ?? "");
  if (!registrationId) return;
  const reviewNote = String(formData.get("reviewNote") ?? "").trim().slice(0, 500) || null;

  const supabase = await createClient();
  const { data: updated } = await supabase
    .from("registrations")
    .update({
      status: "rejected",
      reviewed_by: ctx.userId,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote,
    })
    .eq("id", registrationId)
    .eq("org_id", ctx.orgId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!updated) return;

  await supabase.from("audit_log").insert({
    org_id: ctx.orgId,
    actor_id: ctx.userId,
    action: "reject",
    entity_table: "registrations",
    entity_id: registrationId,
    before: { status: "pending" },
    after: { status: "rejected" },
  });

  revalidatePath("/registrations");
}
