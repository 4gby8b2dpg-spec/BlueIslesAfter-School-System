import Link from "next/link";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { METRIC_DEFINITIONS } from "@/lib/metrics";
import { REPORT_TEMPLATES, buildReport, type TemplateKey } from "@/lib/reports";
import { CardIcon } from "@/components/card-icon";
import {
  createReportSchedule,
  toggleReportSchedule,
  deleteReportSchedule,
  sendReportNow,
} from "./actions";
import { ReportActions } from "@/components/report-actions";
import "./reports.css";
import { PageHead } from "@/components/page-head";

export const dynamic = "force-dynamic";

const TEMPLATES = REPORT_TEMPLATES;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; from?: string; to?: string }>;
}) {
  const ctx = await requireAppContext();
  const sp = await searchParams;
  const template: TemplateKey = TEMPLATES.some((t) => t.key === sp.template)
    ? (sp.template as TemplateKey)
    : "program";

  const now = new Date();
  const defFrom = new Date(now.getTime() - 60 * 86_400_000);
  const from = sp.from || iso(defFrom);
  const to = sp.to || iso(now);

  const supabase = await createClient();
  const { title, columns, rows } = await buildReport(supabase, ctx.orgId, template, from, to);

  const canSchedule = ["admin", "director"].includes(ctx.role);
  const [schedulesRes, deliveriesRes] = canSchedule
    ? await Promise.all([
        supabase
          .from("report_schedules")
          .select(
            "id, template, cadence, day_of_week, day_of_month, hour, timezone, lookback_days, recipients, active",
          )
          .eq("org_id", ctx.orgId)
          .order("created_at", { ascending: true }),
        supabase
          .from("report_deliveries")
          .select("id, template, period_from, period_to, status, error, triggered_by, sent_at")
          .eq("org_id", ctx.orgId)
          .order("sent_at", { ascending: false })
          .limit(8),
      ])
    : [{ data: [] }, { data: [] }];
  const schedules = (schedulesRes.data ?? []) as {
    id: string;
    template: string;
    cadence: string;
    day_of_week: number | null;
    day_of_month: number | null;
    hour: number;
    timezone: string;
    lookback_days: number;
    recipients: string[];
    active: boolean;
  }[];
  const deliveries = (deliveriesRes.data ?? []) as {
    id: string;
    template: string;
    period_from: string;
    period_to: string;
    status: string;
    error: string | null;
    triggered_by: string;
    sent_at: string;
  }[];

  const generatedAt = now.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const rangeLabel = `${new Date(from).toLocaleDateString("en-US", { dateStyle: "medium" } as Intl.DateTimeFormatOptions)} – ${new Date(to).toLocaleDateString("en-US", { dateStyle: "medium" } as Intl.DateTimeFormatOptions)}`;
  const filename = `blueisles-${template}-${from}-to-${to}.xlsx`;

  return (
    <main className="dash reports-page">
      <PageHead href="/reports" title="Reports" tone="coral" className="no-print">
        Pick a template and date range. Export to Excel, or print to PDF.
      </PageHead>

      {/* template gallery */}
      <div className="report-templates no-print">
        {TEMPLATES.map((t) => (
          <Link
            key={t.key}
            href={`/reports?template=${t.key}&from=${from}&to=${to}`}
            className={t.key === template ? "rt-card active" : "rt-card"}
          >
            <span className="rt-title">{t.title}</span>
            <span className="rt-blurb">{t.blurb}</span>
          </Link>
        ))}
      </div>

      {/* date range */}
      <form className="report-range no-print" method="get">
        <input type="hidden" name="template" value={template} />
        <label>
          <span>From</span>
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label>
          <span>To</span>
          <input type="date" name="to" defaultValue={to} />
        </label>
        <button className="btn-primary" type="submit">
          Generate
        </button>
      </form>

      {/* the report document */}
      <article className="report-doc">
        <header className="report-doc-head">
          <div>
            <h2>{title}</h2>
            <p className="report-org">{ctx.orgName}</p>
          </div>
          <div className="report-actions-wrap no-print">
            <ReportActions
              filename={filename}
              sheetName={title}
              columns={columns}
              rows={rows}
            />
          </div>
        </header>

        <dl className="report-stamp">
          <div>
            <dt>Date range</dt>
            <dd>{rangeLabel}</dd>
          </div>
          <div>
            <dt>Generated</dt>
            <dd>{generatedAt}</dd>
          </div>
          <div>
            <dt>Prepared by</dt>
            <dd>{ctx.fullName}</dd>
          </div>
        </dl>

        {rows.length === 0 ? (
          <p className="empty">No data in this date range. Try widening the dates.</p>
        ) : (
          <div className="report-scroll">
            <table className="report-table">
              <thead>
                <tr>
                  {columns.map((c, i) => (
                    <th key={i} className={i === 0 ? "" : "right"}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((cell, j) => (
                      <td key={j} className={j === 0 ? "" : "right num"}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="report-defs">
          <h3>How these numbers are defined</h3>
          <ul>
            <li>
              <strong>{METRIC_DEFINITIONS.attendance_rate.label}:</strong>{" "}
              {METRIC_DEFINITIONS.attendance_rate.formula}. {METRIC_DEFINITIONS.attendance_rate.note}
            </li>
            <li>
              <strong>{METRIC_DEFINITIONS.avg_daily_attendance.label}:</strong>{" "}
              {METRIC_DEFINITIONS.avg_daily_attendance.formula}.
            </li>
            <li>
              <strong>{METRIC_DEFINITIONS.unduplicated_participants.label}:</strong>{" "}
              {METRIC_DEFINITIONS.unduplicated_participants.formula}.
            </li>
          </ul>
          <p className="report-fresh">
            Figures reflect data entered as of {generatedAt}. Generated by BlueIsles.
          </p>
        </footer>
      </article>

      {canSchedule && (
        <section className="card no-print schedule-card">
          <div className="card-head">
            <div className="card-title">
              <span className="spot amber">
                <CardIcon name="clock" />
              </span>
              <h2>Scheduled delivery</h2>
            </div>
            <span className="card-sub">Emailed automatically, with an Excel attachment</span>
          </div>

          <ul className="schedule-list">
            {schedules.map((s) => {
              const t = TEMPLATES.find((x) => x.key === s.template);
              const when =
                s.cadence === "weekly"
                  ? `Every ${DAY_NAMES[s.day_of_week ?? 1]}`
                  : `Day ${s.day_of_month} monthly`;
              return (
                <li key={s.id} className={s.active ? "schedule-row" : "schedule-row off"}>
                  <span className="sch-main">
                    <span className="sch-name">{t?.title ?? s.template}</span>
                    <span className="sch-when">
                      {when} at {String(s.hour).padStart(2, "0")}:00 · {s.timezone} · last{" "}
                      {s.lookback_days} days
                    </span>
                    <span className="sch-to">{s.recipients.join(", ")}</span>
                  </span>
                  <span className="sch-actions">
                    {!s.active && <span className="sch-paused">Paused</span>}
                    <form action={sendReportNow}>
                      <input type="hidden" name="scheduleId" value={s.id} />
                      <button className="mini-btn" type="submit">
                        Send now
                      </button>
                    </form>
                    <form action={toggleReportSchedule}>
                      <input type="hidden" name="scheduleId" value={s.id} />
                      <input type="hidden" name="active" value={s.active ? "false" : "true"} />
                      <button className="link-btn" type="submit">
                        {s.active ? "Pause" : "Resume"}
                      </button>
                    </form>
                    <form action={deleteReportSchedule}>
                      <input type="hidden" name="scheduleId" value={s.id} />
                      <button className="link-btn danger" type="submit">
                        Delete
                      </button>
                    </form>
                  </span>
                </li>
              );
            })}
            {schedules.length === 0 && (
              <li className="empty">
                No scheduled reports yet. Add one below to have it emailed automatically.
              </li>
            )}
          </ul>

          <form action={createReportSchedule} className="schedule-form">
            <label>
              <span>Report</span>
              <select name="template" defaultValue={template}>
                {TEMPLATES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>How often</span>
              <select name="cadence" defaultValue="monthly">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label>
              <span>Weekday (weekly)</span>
              <select name="dayOfWeek" defaultValue="1">
                {DAY_NAMES.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Day (monthly)</span>
              <input type="number" name="dayOfMonth" min={1} max={28} defaultValue={1} />
            </label>
            <label>
              <span>Hour</span>
              <input type="number" name="hour" min={0} max={23} defaultValue={7} />
            </label>
            <label>
              <span>Covers last (days)</span>
              <input type="number" name="lookbackDays" min={1} max={400} defaultValue={30} />
            </label>
            <label className="sch-wide">
              <span>Send to (comma separated)</span>
              <input name="recipients" placeholder="director@example.org, board@example.org" required />
            </label>
            <input type="hidden" name="timezone" value="America/New_York" />
            <button className="btn-primary" type="submit">
              Add schedule
            </button>
          </form>

          {deliveries.length > 0 && (
            <>
              <h3 className="sch-log-head">Recent deliveries</h3>
              <ul className="sch-log">
                {deliveries.map((d) => (
                  <li key={d.id} className={d.status === "sent" ? "sch-ok" : "sch-fail"}>
                    <span className="sch-log-status">{d.status === "sent" ? "✓" : "!"}</span>
                    <span className="sch-log-txt">
                      {TEMPLATES.find((x) => x.key === d.template)?.title ?? d.template} ·{" "}
                      {d.period_from} → {d.period_to}
                      {d.triggered_by === "manual" ? " · test send" : ""}
                      {d.error ? ` — ${d.error}` : ""}
                    </span>
                    <span className="sch-log-when">
                      {new Date(d.sent_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </main>
  );
}
