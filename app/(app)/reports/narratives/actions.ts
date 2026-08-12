"use server";

import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { parseNarrativeBlocks } from "@/lib/narratives";
import { getKpiSnapshot, getChartSeries, isNarrativeMetricKey } from "@/lib/narrative-metrics";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
    entity_table: "report_narratives",
    entity_id: entityId,
    before: before ?? null,
    after: after ?? null,
  });
}

async function requireEditor() {
  const ctx = await requireAppContext();
  if (!["admin", "director"].includes(ctx.role)) return null;
  return ctx;
}

export async function saveNarrative(formData: FormData) {
  const ctx = await requireEditor();
  if (!ctx) return;

  const id = String(formData.get("id") ?? "").trim() || null;
  const title = String(formData.get("title") ?? "").trim() || "Untitled narrative";
  const blocks = parseNarrativeBlocks(String(formData.get("blocks") ?? "[]"));

  const supabase = await createClient();
  if (id) {
    const { data: before } = await supabase
      .from("report_narratives")
      .select("title, blocks")
      .eq("id", id)
      .eq("org_id", ctx.orgId)
      .maybeSingle();
    if (!before) return;
    await supabase
      .from("report_narratives")
      .update({ title, blocks })
      .eq("id", id)
      .eq("org_id", ctx.orgId);
    await logAudit(supabase, ctx.orgId, ctx.userId, "update", id, before, { title, blocks });
    revalidatePath(`/reports/narratives/${id}`);
    revalidatePath("/reports/narratives");
    return;
  }

  const { data, error } = await supabase
    .from("report_narratives")
    .insert({ org_id: ctx.orgId, title, blocks, created_by: ctx.userId })
    .select("id")
    .single();
  if (error || !data) return;
  await logAudit(supabase, ctx.orgId, ctx.userId, "create", data.id, null, { title, blocks });
  revalidatePath("/reports/narratives");
  redirect(`/reports/narratives/${data.id}`);
}

export async function deleteNarrative(formData: FormData) {
  const ctx = await requireEditor();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("report_narratives")
    .select("title")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!before) return;

  await supabase.from("report_narratives").delete().eq("id", id).eq("org_id", ctx.orgId);
  await logAudit(supabase, ctx.orgId, ctx.userId, "delete", id, before, null);
  revalidatePath("/reports/narratives");
  redirect("/reports/narratives");
}

/** Fetches a KPI snapshot for the builder to freeze into a block. */
export async function fetchKpiSnapshot(metric: string, from: string, to: string) {
  const ctx = await requireEditor();
  if (!ctx || !isNarrativeMetricKey(metric)) return null;
  const supabase = await createClient();
  return getKpiSnapshot(supabase, ctx.orgId, metric, from, to);
}

/** Fetches a weekly org-wide trend for the builder's live chart preview. */
export async function fetchChartSeries(metric: string, from: string, to: string) {
  const ctx = await requireEditor();
  if (!ctx || !isNarrativeMetricKey(metric)) return null;
  const supabase = await createClient();
  return getChartSeries(supabase, ctx.orgId, metric, from, to);
}
