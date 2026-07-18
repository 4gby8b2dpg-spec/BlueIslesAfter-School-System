"use server";

import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createProgram(formData: FormData) {
  const ctx = await requireAppContext();
  if (!["admin", "director"].includes(ctx.role)) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const category = String(formData.get("category") ?? "").trim() || null;
  const siteId = String(formData.get("siteId") ?? "") || null;
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const capacity = capacityRaw ? Number(capacityRaw) : null;

  const supabase = await createClient();

  // default to the org's first term, if any
  const { data: term } = await supabase
    .from("terms")
    .select("id")
    .eq("org_id", ctx.orgId)
    .limit(1)
    .maybeSingle();

  const { data: created } = await supabase
    .from("programs")
    .insert({
      org_id: ctx.orgId,
      name,
      category,
      site_id: siteId,
      term_id: term?.id ?? null,
      capacity: Number.isFinite(capacity) ? capacity : null,
      status: "active",
    })
    .select("id")
    .single();

  revalidatePath("/programs");
  revalidatePath("/dashboard");
  if (created?.id) redirect(`/programs/${created.id}`);
}

export async function deleteProgram(formData: FormData) {
  const ctx = await requireAppContext();
  if (!["admin", "director"].includes(ctx.role)) return;
  const programId = String(formData.get("programId") ?? "");
  if (!programId) return;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("programs")
    .select("name")
    .eq("id", programId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  // Surveys reference programs without cascade — detach so the delete succeeds.
  await supabase.from("surveys").update({ program_id: null }).eq("org_id", ctx.orgId).eq("program_id", programId);
  // Delete cascades enrollments, sessions (→ attendance), activities, flags.
  await supabase.from("programs").delete().eq("id", programId).eq("org_id", ctx.orgId);

  await supabase.from("audit_log").insert({
    org_id: ctx.orgId,
    actor_id: ctx.userId,
    action: "delete",
    entity_table: "programs",
    entity_id: programId,
    before,
    after: null,
  });

  revalidatePath("/programs");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  redirect("/programs");
}

export async function createSession(formData: FormData) {
  const ctx = await requireAppContext();
  if (!["admin", "director", "staff"].includes(ctx.role)) return;

  const programId = String(formData.get("programId") ?? "");
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const durationMin = Number(formData.get("durationMin") ?? 90) || 90;
  const room = String(formData.get("room") ?? "").trim() || null;
  if (!programId || !date || !startTime) return;

  // Build timestamps from the local date + time inputs.
  const start = new Date(`${date}T${startTime}`);
  if (isNaN(start.getTime())) return;
  const end = new Date(start.getTime() + durationMin * 60_000);

  const supabase = await createClient();
  await supabase.from("sessions").insert({
    org_id: ctx.orgId,
    program_id: programId,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    room,
    status: "scheduled",
  });

  revalidatePath(`/programs/${programId}`);
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
}
