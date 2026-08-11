"use server";

import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { autoPromoteWaitlist } from "@/lib/enrollment";
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

// Rename in place — handy right after confirming a clone, but available any time.
export async function renameProgram(formData: FormData) {
  const ctx = await requireAppContext();
  if (!["admin", "director"].includes(ctx.role)) return;

  const programId = String(formData.get("programId") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  if (!programId || !name) return;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("programs")
    .select("name")
    .eq("id", programId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!before || before.name === name) return;

  await supabase
    .from("programs")
    .update({ name })
    .eq("id", programId)
    .eq("org_id", ctx.orgId);

  await supabase.from("audit_log").insert({
    org_id: ctx.orgId,
    actor_id: ctx.userId,
    action: "rename",
    entity_table: "programs",
    entity_id: programId,
    before: { name: before.name },
    after: { name },
  });

  revalidatePath("/programs");
  revalidatePath(`/programs/${programId}`);
  revalidatePath("/dashboard");
}

// Clone a program (FR-C.6): copies the program, its activities, and — shifted
// to a new start date — its session schedule, so next term is one click away.
export async function cloneProgram(formData: FormData) {
  const ctx = await requireAppContext();
  if (!["admin", "director"].includes(ctx.role)) return;

  const sourceId = String(formData.get("programId") ?? "");
  if (!sourceId) return;
  const copySessions = String(formData.get("copySessions") ?? "") === "on";
  const newStart = String(formData.get("newStart") ?? ""); // yyyy-mm-dd, optional
  const termId = String(formData.get("termId") ?? "") || null;

  const supabase = await createClient();

  const { data: src } = await supabase
    .from("programs")
    .select(
      "name, category, site_id, term_id, capacity, grade_min, grade_max, ratio_target, funding_source, description_goals",
    )
    .eq("id", sourceId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!src) return;

  const name = String(formData.get("name") ?? "").trim() || `${src.name} (copy)`;

  // 1) the program — a fresh clone starts in planning and closed to registration.
  const { data: newProg } = await supabase
    .from("programs")
    .insert({
      org_id: ctx.orgId,
      name,
      category: src.category,
      site_id: src.site_id,
      term_id: termId ?? src.term_id,
      capacity: src.capacity,
      grade_min: src.grade_min,
      grade_max: src.grade_max,
      ratio_target: src.ratio_target,
      funding_source: src.funding_source,
      description_goals: src.description_goals,
      status: "planning",
      accepting_registrations: false,
    })
    .select("id")
    .single();
  if (!newProg) return;

  // 2) activities — keep a map so sessions can point at the copies.
  const actMap = new Map<string, string>();
  const { data: acts } = await supabase
    .from("activities")
    .select("id, name, default_duration_min, default_room, materials")
    .eq("org_id", ctx.orgId)
    .eq("program_id", sourceId);
  for (const a of acts ?? []) {
    const { data: newAct } = await supabase
      .from("activities")
      .insert({
        org_id: ctx.orgId,
        program_id: newProg.id,
        name: a.name,
        default_duration_min: a.default_duration_min,
        default_room: a.default_room,
        materials: a.materials,
      })
      .select("id")
      .single();
    if (newAct) actMap.set(a.id as string, newAct.id as string);
  }

  // 3) sessions — shifted so the earliest lands on newStart (whole-day shift,
  // preserving time-of-day and the spacing between sessions).
  let sessionCount = 0;
  if (copySessions) {
    const { data: sess } = await supabase
      .from("sessions")
      .select("activity_id, starts_at, ends_at, room, recurrence_id")
      .eq("org_id", ctx.orgId)
      .eq("program_id", sourceId)
      .order("starts_at", { ascending: true });

    if (sess && sess.length) {
      let deltaMs = 0;
      if (newStart) {
        const earliestMidnight = new Date(`${(sess[0].starts_at as string).slice(0, 10)}T00:00:00Z`).getTime();
        const targetMidnight = new Date(`${newStart}T00:00:00Z`).getTime();
        deltaMs = targetMidnight - earliestMidnight;
      }
      // New recurrence_id per source series, so grouping survives the copy.
      const recMap = new Map<string, string>();
      const rows = sess.map((s) => {
        const oldRec = s.recurrence_id as string | null;
        let newRec: string | null = null;
        if (oldRec) {
          newRec = recMap.get(oldRec) ?? crypto.randomUUID();
          recMap.set(oldRec, newRec);
        }
        const oldAct = s.activity_id as string | null;
        return {
          org_id: ctx.orgId,
          program_id: newProg.id,
          activity_id: oldAct ? actMap.get(oldAct) ?? null : null,
          starts_at: new Date(new Date(s.starts_at as string).getTime() + deltaMs).toISOString(),
          ends_at: new Date(new Date(s.ends_at as string).getTime() + deltaMs).toISOString(),
          room: s.room,
          recurrence_id: newRec,
          status: "scheduled",
        };
      });
      const { data: inserted } = await supabase.from("sessions").insert(rows).select("id");
      sessionCount = inserted?.length ?? 0;
    }
  }

  await supabase.from("audit_log").insert({
    org_id: ctx.orgId,
    actor_id: ctx.userId,
    action: "clone",
    entity_table: "programs",
    entity_id: newProg.id,
    before: { cloned_from: sourceId },
    after: { name, activities: actMap.size, sessions: sessionCount },
  });

  revalidatePath("/programs");
  revalidatePath("/dashboard");
  redirect(`/programs/${newProg.id}`);
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

// Promote a waitlisted participant into an open seat.
export async function promoteFromWaitlist(formData: FormData) {
  const ctx = await requireAppContext();
  if (!["admin", "director", "staff"].includes(ctx.role)) return;
  const enrollmentId = String(formData.get("enrollmentId"));
  const programId = String(formData.get("programId"));
  if (!enrollmentId) return;

  const supabase = await createClient();
  await supabase
    .from("enrollments")
    .update({
      status: "enrolled",
      enrolled_on: new Date().toISOString().slice(0, 10),
      waitlist_position: null,
      source: "waitlist_promo",
    })
    .eq("id", enrollmentId)
    .eq("org_id", ctx.orgId)
    .eq("status", "waitlisted");

  revalidatePath(`/programs/${programId}`);
  revalidatePath("/participants");
  revalidatePath("/dashboard");
}

// Set/change a program's capacity (empty or 0 clears it). Admin/director.
export async function updateProgramCapacity(formData: FormData) {
  const ctx = await requireAppContext();
  if (!["admin", "director"].includes(ctx.role)) return;
  const programId = String(formData.get("programId"));
  if (!programId) return;
  const raw = String(formData.get("capacity") ?? "").trim();
  const n = raw ? Math.round(Number(raw)) : 0;
  const capacity = Number.isFinite(n) && n > 0 ? n : null;

  const supabase = await createClient();
  await supabase
    .from("programs")
    .update({ capacity })
    .eq("id", programId)
    .eq("org_id", ctx.orgId);

  // Raising capacity can open seats — fill them from the waitlist.
  // (Clearing the cap is treated as uncapped and promotes no one here.)
  const promoted = await autoPromoteWaitlist(supabase, ctx.orgId, programId);
  for (const pr of promoted) {
    await supabase.from("audit_log").insert({
      org_id: ctx.orgId,
      actor_id: ctx.userId,
      action: "waitlist_promote",
      entity_table: "enrollments",
      entity_id: pr.id,
      before: { status: "waitlisted", trigger: "capacity_change" },
      after: { status: "enrolled", name: pr.name },
    });
  }

  revalidatePath(`/programs/${programId}`);
  revalidatePath("/dashboard");
}

// Toggle whether a program appears on the public parent-registration form (0011).
export async function setAcceptingRegistrations(formData: FormData) {
  const ctx = await requireAppContext();
  if (!["admin", "director"].includes(ctx.role)) return;
  const programId = String(formData.get("programId"));
  if (!programId) return;
  const accepting = String(formData.get("accepting") ?? "") === "true";

  const supabase = await createClient();
  await supabase
    .from("programs")
    .update({ accepting_registrations: accepting })
    .eq("id", programId)
    .eq("org_id", ctx.orgId);

  revalidatePath(`/programs/${programId}`);
}
