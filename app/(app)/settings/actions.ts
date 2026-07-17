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
