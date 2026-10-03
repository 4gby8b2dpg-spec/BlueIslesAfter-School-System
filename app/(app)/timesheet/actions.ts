"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { zonedToUtc } from "@/lib/timezone";
import type { SupabaseClient } from "@supabase/supabase-js";

async function logAudit(
  supabase: SupabaseClient,
  orgId: string,
  actorId: string,
  action: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
) {
  await supabase.from("audit_log").insert({
    org_id: orgId,
    actor_id: actorId,
    action,
    entity_table: "staff_time_entries",
    entity_id: entityId,
    before: before ?? null,
    after: after ?? null,
  });
}

function refresh() {
  revalidatePath("/timesheet");
  revalidatePath("/dashboard");
}

// Staff (and admins/directors) clock in at one site. The partial unique
// index in 0025 is the real guard against double clock-ins; this check just
// gives a friendly message first.
export async function clockIn(formData: FormData) {
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const siteId = String(formData.get("siteId") ?? "");
  if (!siteId) redirect("/timesheet?error=site");

  // The site must belong to this org — RLS on sites already scopes this read.
  const { data: site } = await supabase
    .from("sites")
    .select("id")
    .eq("id", siteId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!site) redirect("/timesheet?error=site");

  const { data: open } = await supabase
    .from("staff_time_entries")
    .select("id")
    .eq("user_id", ctx.userId)
    .is("clock_out_at", null)
    .maybeSingle();
  if (open) redirect("/timesheet?error=already");

  const { data: entry, error } = await supabase
    .from("staff_time_entries")
    .insert({
      org_id: ctx.orgId,
      site_id: siteId,
      user_id: ctx.userId,
      clock_in_at: new Date().toISOString(),
    })
    .select("id, clock_in_at")
    .single();
  if (error || !entry) redirect("/timesheet?error=failed");

  await logAudit(supabase, ctx.orgId, ctx.userId, "create", entry.id, null, {
    site_id: siteId,
    clock_in_at: entry.clock_in_at,
  });
  refresh();
}

// Closes the caller's own open entry. RLS also enforces user_id = me.
export async function clockOut() {
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const { data: open } = await supabase
    .from("staff_time_entries")
    .select("id, clock_in_at")
    .eq("user_id", ctx.userId)
    .is("clock_out_at", null)
    .maybeSingle();
  if (!open) redirect("/timesheet");

  const clockOutAt = new Date().toISOString();
  const { error } = await supabase
    .from("staff_time_entries")
    .update({ clock_out_at: clockOutAt })
    .eq("id", open.id)
    .eq("user_id", ctx.userId)
    .is("clock_out_at", null);
  if (error) redirect("/timesheet?error=failed");

  await logAudit(supabase, ctx.orgId, ctx.userId, "update", open.id, { clock_out_at: null }, { clock_out_at: clockOutAt });
  refresh();
}

// Admin/director correction of any entry (e.g. someone forgot to clock out).
export async function correctEntry(formData: FormData) {
  const ctx = await requireAppContext();
  if (!["admin", "director"].includes(ctx.role)) return;

  const id = String(formData.get("entryId") ?? "");
  const clockInRaw = String(formData.get("clockIn") ?? "");
  const clockOutRaw = String(formData.get("clockOut") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  if (!id || !clockInRaw) return;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("staff_time_entries")
    .select("clock_in_at, clock_out_at, note, sites(timezone)")
    .eq("id", id)
    .maybeSingle();
  if (!before) return;

  // Times are typed in the site's local time, so convert using its zone.
  const site = Array.isArray(before.sites) ? before.sites[0] : before.sites;
  const tz = site?.timezone ?? "America/New_York";
  const clockIn = zonedToUtc(clockInRaw, tz);
  const clockOut = clockOutRaw ? zonedToUtc(clockOutRaw, tz) : null;
  if (!clockIn) return;
  if (clockOutRaw && (!clockOut || clockOut <= clockIn)) return;

  const after = {
    clock_in_at: clockIn.toISOString(),
    clock_out_at: clockOut?.toISOString() ?? null,
    note,
  };
  const { error } = await supabase.from("staff_time_entries").update(after).eq("id", id);
  if (error) return;

  await logAudit(supabase, ctx.orgId, ctx.userId, "update", id, before, after);
  refresh();
}
