"use server";

import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { isTemplateKey } from "@/lib/reports";
import { deliverSchedule, type Schedule } from "@/lib/report-scheduler";
import { revalidatePath } from "next/cache";

async function requireScheduler() {
  const ctx = await requireAppContext();
  if (!["admin", "director"].includes(ctx.role)) return null;
  return ctx;
}

function parseRecipients(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,\n;]/)
        .map((s) => s.trim())
        .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)),
    ),
  ].slice(0, 20);
}

export async function createReportSchedule(formData: FormData) {
  const ctx = await requireScheduler();
  if (!ctx) return;

  const template = String(formData.get("template") ?? "");
  if (!isTemplateKey(template)) return;

  const cadence = String(formData.get("cadence") ?? "weekly");
  if (!["weekly", "monthly"].includes(cadence)) return;

  const recipients = parseRecipients(String(formData.get("recipients") ?? ""));
  if (recipients.length === 0) return;

  const clamp = (v: unknown, lo: number, hi: number, dflt: number) => {
    const n = Math.round(Number(String(v ?? "").trim()));
    return Number.isNaN(n) ? dflt : Math.min(hi, Math.max(lo, n));
  };

  const supabase = await createClient();
  await supabase.from("report_schedules").insert({
    org_id: ctx.orgId,
    template,
    cadence,
    day_of_week: cadence === "weekly" ? clamp(formData.get("dayOfWeek"), 0, 6, 1) : null,
    day_of_month: cadence === "monthly" ? clamp(formData.get("dayOfMonth"), 1, 28, 1) : null,
    hour: clamp(formData.get("hour"), 0, 23, 7),
    timezone: String(formData.get("timezone") ?? "America/New_York").trim() || "America/New_York",
    lookback_days: clamp(formData.get("lookbackDays"), 1, 400, cadence === "weekly" ? 7 : 30),
    recipients,
    created_by: ctx.userId,
  });

  revalidatePath("/reports");
}

export async function toggleReportSchedule(formData: FormData) {
  const ctx = await requireScheduler();
  if (!ctx) return;
  const id = String(formData.get("scheduleId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("report_schedules")
    .update({ active })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidatePath("/reports");
}

export async function deleteReportSchedule(formData: FormData) {
  const ctx = await requireScheduler();
  if (!ctx) return;
  const id = String(formData.get("scheduleId") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("report_schedules").delete().eq("id", id).eq("org_id", ctx.orgId);
  revalidatePath("/reports");
}

/**
 * Manual test send. Runs the same delivery path as the cron, but marked
 * `manual` so it doesn't claim the day and suppress the real scheduled send.
 * Uses the caller's RLS client — a director can only ever send their own org's
 * data, so no service-role key is needed here.
 */
export async function sendReportNow(formData: FormData) {
  const ctx = await requireScheduler();
  if (!ctx) return;
  const id = String(formData.get("scheduleId") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("report_schedules")
    .select(
      "id, org_id, template, cadence, day_of_week, day_of_month, hour, timezone, lookback_days, recipients, active, last_sent_on",
    )
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!data) return;

  await deliverSchedule(supabase, data as Schedule, new Date(), "manual");
  revalidatePath("/reports");
}
