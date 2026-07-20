import Link from "next/link";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { METRIC_DEFINITIONS } from "@/lib/metrics";
import { REPORT_TEMPLATES, buildReport, type TemplateKey } from "@/lib/reports";
import { ReportActions } from "@/components/report-actions";
import "./reports.css";
import { PageHead } from "@/components/page-head";

export const dynamic = "force-dynamic";

const TEMPLATES = REPORT_TEMPLATES;

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
    </main>
  );
}
