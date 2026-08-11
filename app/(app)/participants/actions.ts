"use server";

import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { autoPromoteWaitlist } from "@/lib/enrollment";
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

const CONTACT_KINDS = ["call", "email", "text", "meeting", "note"];

export async function logContact(formData: FormData) {
  const ctx = await requireAppContext();
  if (!["admin", "director", "staff"].includes(ctx.role)) return;

  const participantId = String(formData.get("participantId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const summary = String(formData.get("summary") ?? "").trim().slice(0, 2000);
  if (!participantId || !CONTACT_KINDS.includes(kind) || !summary) return;

  const guardianId = String(formData.get("guardianId") ?? "") || null;
  const directionRaw = String(formData.get("direction") ?? "");
  const direction = directionRaw === "inbound" || directionRaw === "outbound" ? directionRaw : null;
  const occurredOn = String(formData.get("occurredOn") ?? "") || today();

  const supabase = await createClient();

  // Confirm the participant is in the caller's org before attaching a log to it.
  const { data: person } = await supabase
    .from("participants")
    .select("id")
    .eq("id", participantId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!person) return;

  await supabase.from("contact_log").insert({
    org_id: ctx.orgId,
    participant_id: participantId,
    guardian_id: guardianId,
    kind,
    direction,
    summary,
    occurred_on: occurredOn,
    logged_by: ctx.userId,
  });

  revalidatePath(`/participants/${participantId}`);
}

export async function deleteContact(formData: FormData) {
  const ctx = await requireAppContext();
  if (!["admin", "director"].includes(ctx.role)) return;
  const id = String(formData.get("id") ?? "");
  const participantId = String(formData.get("participantId") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("contact_log").delete().eq("id", id).eq("org_id", ctx.orgId);
  revalidatePath(`/participants/${participantId}`);
}

export async function withdrawEnrollment(formData: FormData) {
  const ctx = await requireAppContext();
  if (!["admin", "director", "staff"].includes(ctx.role)) return;
  const enrollmentId = String(formData.get("enrollmentId"));
  const participantId = String(formData.get("participantId"));
  if (!enrollmentId) return;

  const supabase = await createClient();
  // Grab the program before withdrawing so we can backfill the seat it frees.
  const { data: before } = await supabase
    .from("enrollments")
    .select("program_id")
    .eq("id", enrollmentId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  await supabase
    .from("enrollments")
    .update({ status: "withdrawn", withdrawn_on: today() })
    .eq("id", enrollmentId)
    .eq("org_id", ctx.orgId);

  // Auto-promote the next person off the waitlist into the freed seat (FR-B.4).
  const programId = before?.program_id as string | undefined;
  if (programId) {
    const promoted = await autoPromoteWaitlist(supabase, ctx.orgId, programId);
    for (const pr of promoted) {
      await supabase.from("audit_log").insert({
        org_id: ctx.orgId,
        actor_id: ctx.userId,
        action: "waitlist_promote",
        entity_table: "enrollments",
        entity_id: pr.id,
        before: { status: "waitlisted", trigger: "withdrawal" },
        after: { status: "enrolled", name: pr.name },
      });
    }
    revalidatePath(`/programs/${programId}`);
  }

  revalidatePath(`/participants/${participantId}`);
  revalidatePath("/participants");
  revalidatePath("/dashboard");
}
