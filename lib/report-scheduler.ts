import type { SupabaseClient } from "@supabase/supabase-js";
import { buildReport, isTemplateKey, type TemplateKey } from "@/lib/reports";
import { renderReportHtml, reportToXlsxBase64 } from "@/lib/report-render";
import { sendEmail } from "@/lib/mailer";

// Decides which schedules are due and sends them. Shared by the hourly cron and
// the "Send now" button, so a test send exercises the real delivery path.

export type Schedule = {
  id: string;
  org_id: string;
  template: string;
  cadence: "weekly" | "monthly";
  day_of_week: number | null;
  day_of_month: number | null;
  hour: number;
  timezone: string;
  lookback_days: number;
  recipients: string[];
  active: boolean;
  last_sent_on: string | null;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** The wall-clock date/hour/weekday at `now` inside `timezone`. */
export function localParts(now: Date, timezone: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      weekday: "short",
    }).formatToParts(now);
  } catch {
    // unknown timezone string — fall back to UTC rather than skipping the send
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      weekday: "short",
    }).formatToParts(now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // "24" appears at midnight in some ICU versions; normalise it to 0
  const hour = Number(get("hour")) % 24;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    day: Number(get("day")),
    hour,
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

/**
 * Due when: active, not already sent on this local date, the local day matches
 * the cadence, and the local hour has reached the target. Using `>=` on the
 * hour means a missed cron run still goes out later the same day rather than
 * being skipped until next week.
 */
export function isScheduleDue(s: Schedule, now: Date): boolean {
  if (!s.active) return false;
  const l = localParts(now, s.timezone);
  if (s.last_sent_on === l.date) return false;
  if (l.hour < s.hour) return false;
  if (s.cadence === "weekly") return l.weekday === s.day_of_week;
  return l.day === s.day_of_month;
}

/** Reporting window: ends today (local), starts `lookback_days` earlier. */
export function periodFor(s: Schedule, now: Date) {
  const l = localParts(now, s.timezone);
  const to = l.date;
  const toDate = new Date(`${to}T00:00:00Z`);
  const from = new Date(toDate.getTime() - s.lookback_days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return { from, to };
}

function pretty(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Builds and emails one schedule, then records the outcome. `trigger` marks
 * whether it came from the cron or a manual "Send now"; manual sends don't
 * claim the day, so they never suppress the real scheduled delivery.
 */
export async function deliverSchedule(
  supabase: SupabaseClient,
  s: Schedule,
  now: Date,
  trigger: "schedule" | "manual" = "schedule",
): Promise<{ ok: boolean; error?: string }> {
  const template: TemplateKey = isTemplateKey(s.template) ? s.template : "program";
  const { from, to } = periodFor(s, now);

  let result: { ok: boolean; error?: string };
  try {
    const { data: org } = await supabase
      .from("orgs")
      .select("name")
      .eq("id", s.org_id)
      .maybeSingle();
    const orgName = (org?.name as string) ?? "Your organization";

    const report = await buildReport(supabase, s.org_id, template, from, to);
    const rangeLabel = `${pretty(from)} – ${pretty(to)}`;

    const sent = await sendEmail({
      to: s.recipients,
      subject: `${report.title} — ${orgName} (${rangeLabel})`,
      html: renderReportHtml({ report, orgName, rangeLabel }),
      attachments: [
        {
          filename: `blueisles-${template}-${from}-to-${to}.xlsx`,
          content: reportToXlsxBase64(report),
        },
      ],
    });
    result = sent.ok ? { ok: true } : { ok: false, error: sent.error };
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : "Failed to build report." };
  }

  await supabase.from("report_deliveries").insert({
    org_id: s.org_id,
    schedule_id: s.id,
    template,
    period_from: from,
    period_to: to,
    recipients: s.recipients,
    status: result.ok ? "sent" : "failed",
    error: result.error ?? null,
    triggered_by: trigger,
  });

  // Only a real scheduled send claims the local day. A failed send leaves the
  // day unclaimed so the next hourly run retries it.
  if (result.ok && trigger === "schedule") {
    await supabase
      .from("report_schedules")
      .update({ last_sent_on: periodFor(s, now).to })
      .eq("id", s.id);
  }

  return result;
}

/** Cron entry point: deliver every schedule that is due right now. */
export async function runDueSchedules(supabase: SupabaseClient, now = new Date()) {
  const { data, error } = await supabase
    .from("report_schedules")
    .select(
      "id, org_id, template, cadence, day_of_week, day_of_month, hour, timezone, lookback_days, recipients, active, last_sent_on",
    )
    .eq("active", true);

  if (error) return { checked: 0, sent: 0, failed: 0, error: error.message };

  const schedules = (data ?? []) as Schedule[];
  const due = schedules.filter((s) => isScheduleDue(s, now));

  let sent = 0;
  let failed = 0;
  for (const s of due) {
    const r = await deliverSchedule(supabase, s, now, "schedule");
    if (r.ok) sent++;
    else failed++;
  }
  return { checked: schedules.length, sent, failed };
}
