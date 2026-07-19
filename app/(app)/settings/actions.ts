"use server";

import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

async function logAudit(
  supabase: SupabaseClient,
  orgId: string,
  actorId: string,
  action: string,
  table: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
) {
  await supabase.from("audit_log").insert({
    org_id: orgId,
    actor_id: actorId,
    action,
    entity_table: table,
    entity_id: entityId,
    before: before ?? null,
    after: after ?? null,
  });
}

async function requireAdmin() {
  const ctx = await requireAppContext();
  if (ctx.role !== "admin") return null;
  return ctx;
}

export async function updateMemberRole(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const membershipId = String(formData.get("membershipId"));
  const role = String(formData.get("role"));
  if (!membershipId || !["admin", "director", "staff", "viewer"].includes(role)) return;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("memberships")
    .select("role")
    .eq("id", membershipId)
    .maybeSingle();
  await supabase.from("memberships").update({ role }).eq("id", membershipId);
  await logAudit(supabase, ctx.orgId, ctx.userId, "update", "memberships", membershipId, before, { role });

  revalidatePath("/settings");
}

export async function setMemberStatus(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const membershipId = String(formData.get("membershipId"));
  const status = String(formData.get("status"));
  if (!membershipId || !["active", "deactivated", "invited"].includes(status)) return;

  const supabase = await createClient();
  await supabase.from("memberships").update({ status }).eq("id", membershipId);
  await logAudit(supabase, ctx.orgId, ctx.userId, "update", "memberships", membershipId, null, { status });

  revalidatePath("/settings");
}

export async function addSite(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("sites")
    .insert({ org_id: ctx.orgId, name })
    .select("id")
    .single();
  await logAudit(supabase, ctx.orgId, ctx.userId, "create", "sites", data?.id ?? null, null, { name });

  revalidatePath("/settings");
}

export async function addTerm(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const name = String(formData.get("name") ?? "").trim();
  const startsOn = String(formData.get("startsOn") ?? "") || null;
  const endsOn = String(formData.get("endsOn") ?? "") || null;
  if (!name) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("terms")
    .insert({ org_id: ctx.orgId, name, starts_on: startsOn, ends_on: endsOn })
    .select("id")
    .single();
  await logAudit(supabase, ctx.orgId, ctx.userId, "create", "terms", data?.id ?? null, null, {
    name,
    starts_on: startsOn,
    ends_on: endsOn,
  });

  revalidatePath("/settings");
}

export async function toggleSiteActive(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const siteId = String(formData.get("siteId"));
  const active = String(formData.get("active")) === "true";
  if (!siteId) return;

  const supabase = await createClient();
  await supabase.from("sites").update({ is_active: active }).eq("id", siteId).eq("org_id", ctx.orgId);
  await logAudit(supabase, ctx.orgId, ctx.userId, "update", "sites", siteId, null, { is_active: active });
  revalidatePath("/settings");
}

export async function deleteSite(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const siteId = String(formData.get("siteId"));
  if (!siteId) return;

  const supabase = await createClient();
  // Guard: don't delete a site programs still point at.
  const { count } = await supabase
    .from("programs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .eq("site_id", siteId);
  if (count && count > 0) return;

  const { data: before } = await supabase.from("sites").select("name").eq("id", siteId).maybeSingle();
  await supabase.from("sites").delete().eq("id", siteId).eq("org_id", ctx.orgId);
  await logAudit(supabase, ctx.orgId, ctx.userId, "delete", "sites", siteId, before, null);
  revalidatePath("/settings");
}

export async function deleteTerm(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;
  const termId = String(formData.get("termId"));
  if (!termId) return;

  const supabase = await createClient();
  const { count } = await supabase
    .from("programs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .eq("term_id", termId);
  if (count && count > 0) return;

  const { data: before } = await supabase.from("terms").select("name").eq("id", termId).maybeSingle();
  await supabase.from("terms").delete().eq("id", termId).eq("org_id", ctx.orgId);
  await logAudit(supabase, ctx.orgId, ctx.userId, "delete", "terms", termId, before, null);
  revalidatePath("/settings");
}

// Configurable flag thresholds (0006). Read by lib/flags.ts; falls back to
// code defaults when unset. Admin-only, audited.
function clampInt(v: FormDataEntryValue | null, lo: number, hi: number, fallback: number): number {
  const n = Math.round(Number(String(v ?? "").trim()));
  if (Number.isNaN(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

export async function updateThresholds(formData: FormData) {
  const ctx = await requireAdmin();
  if (!ctx) return;

  const warning = clampInt(formData.get("chronicWarningPct"), 1, 100, 10);
  const critical = Math.max(warning, clampInt(formData.get("chronicCriticalPct"), 1, 100, 20));
  const minSessions = clampInt(formData.get("chronicMinSessions"), 1, 60, 5);
  const ratioRaw = String(formData.get("ratioDefaultTarget") ?? "").trim();
  const ratioDefault = ratioRaw ? clampInt(ratioRaw, 1, 100, 10) : null;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("org_settings")
    .select("chronic_warning_pct, chronic_critical_pct, chronic_min_sessions, ratio_default_target")
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  const after = {
    org_id: ctx.orgId,
    chronic_warning_pct: warning,
    chronic_critical_pct: critical,
    chronic_min_sessions: minSessions,
    ratio_default_target: ratioDefault,
  };
  await supabase.from("org_settings").upsert(after, { onConflict: "org_id" });
  await logAudit(supabase, ctx.orgId, ctx.userId, "update", "org_settings", ctx.orgId, before, after);

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}
