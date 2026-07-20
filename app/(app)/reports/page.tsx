import Link from "next/link";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { METRIC_DEFINITIONS } from "@/lib/metrics";
import { ReportActions } from "@/components/report-actions";
import "./reports.css";
import { PageHead } from "@/components/page-head";

export const dynamic = "force-dynamic";

const TEMPLATES = [
  {
    key: "program",
    title: "Monthly Program Report",
    blurb: "Per program: enrollment, sessions held, attendance, participants served.",
  },
  {
    key: "attendance",
    title: "Attendance Summary",
    blurb: "Per participant: present, late, absent, and attendance rate over the range.",
  },
  {
    key: "funder",
    title: "Funder / Grant Report",
    blurb: "Aggregated by funding source: programs, unduplicated participants, attendance.",
  },
] as const;

type TemplateKey = (typeof TEMPLATES)[number]["key"];

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
  const fromTs = new Date(`${from}T00:00:00`).toISOString();
  const toTs = new Date(`${to}T23:59:59`).toISOString();

  const supabase = await createClient();
  const [programsRes, enrollRes, sessionsRes, participantsRes] = await Promise.all([
    supabase
      .from("programs")
      .select("id, name, category, funding_source")
      .eq("org_id", ctx.orgId),
    supabase.from("enrollments").select("program_id, participant_id, status").eq("org_id", ctx.orgId),
    supabase
      .from("sessions")
      .select("id, program_id, status")
      .eq("org_id", ctx.orgId)
      .gte("starts_at", fromTs)
      .lte("starts_at", toTs),
    supabase
      .from("participants")
      .select("id, first_name, last_name, grade")
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null),
  ]);

  const programs = programsRes.data ?? [];
  const enrollments = enrollRes.data ?? [];
  const sessions = sessionsRes.data ?? [];
  const participants = participantsRes.data ?? [];

  // attendance within the session window
  const sessionIds = sessions.map((s) => s.id);
  const sessionProgram = new Map(sessions.map((s) => [s.id, s.program_id]));
  let attendance: { session_id: string; participant_id: string; status: string }[] = [];
  if (sessionIds.length) {
    const { data } = await supabase
      .from("attendance_records")
      .select("session_id, participant_id, status")
      .eq("org_id", ctx.orgId)
      .in("session_id", sessionIds);
    attendance = data ?? [];
  }

  const attended = (s: string) => s === "present" || s === "late";

  // ---- build the selected report as columns + rows ----
  let title = "";
  let columns: string[] = [];
  let rows: (string | number)[][] = [];

  if (template === "program" || template === "funder") {
    // per-program aggregates first
    type Agg = {
      name: string;
      category: string;
      funder: string;
      enrolled: number;
      sessionsHeld: number;
      present: number;
      total: number;
      served: Set<string>;
    };
    const byProgram = new Map<string, Agg>();
    for (const p of programs) {
      byProgram.set(p.id, {
        name: p.name,
        category: p.category ?? "—",
        funder: p.funding_source ?? "Unfunded",
        enrolled: 0,
        sessionsHeld: 0,
        present: 0,
        total: 0,
        served: new Set(),
      });
    }
    for (const e of enrollments) {
      if (e.status !== "enrolled") continue;
      const a = byProgram.get(e.program_id);
      if (a) a.enrolled++;
    }
    for (const s of sessions) {
      if (s.status !== "completed") continue;
      const a = byProgram.get(s.program_id);
      if (a) a.sessionsHeld++;
    }
    for (const r of attendance) {
      const pid = sessionProgram.get(r.session_id);
      if (!pid) continue;
      const a = byProgram.get(pid);
      if (!a) continue;
      if (attended(r.status)) {
        a.present++;
        a.total++;
        a.served.add(r.participant_id);
      } else if (r.status === "absent") a.total++;
    }

    if (template === "program") {
      title = "Monthly Program Report";
      columns = ["Program", "Category", "Funder", "Enrolled", "Sessions held", "Avg daily att.", "Attendance rate", "Served"];
      rows = [...byProgram.values()]
        .sort((x, y) => x.name.localeCompare(y.name))
        .map((a) => [
          a.name,
          a.category,
          a.funder,
          a.enrolled,
          a.sessionsHeld,
          a.sessionsHeld > 0 ? Math.round((a.present / a.sessionsHeld) * 10) / 10 : 0,
          a.total > 0 ? `${Math.round((a.present / a.total) * 100)}%` : "—",
          a.served.size,
        ]);
    } else {
      title = "Funder / Grant Report";
      const byFunder = new Map<
        string,
        { programs: number; enrolled: number; sessionsHeld: number; present: number; total: number; served: Set<string> }
      >();
      for (const a of byProgram.values()) {
        const f = byFunder.get(a.funder) ?? {
          programs: 0,
          enrolled: 0,
          sessionsHeld: 0,
          present: 0,
          total: 0,
          served: new Set<string>(),
        };
        f.programs++;
        f.enrolled += a.enrolled;
        f.sessionsHeld += a.sessionsHeld;
        f.present += a.present;
        f.total += a.total;
        a.served.forEach((x) => f.served.add(x));
        byFunder.set(a.funder, f);
      }
      columns = ["Funding source", "Programs", "Enrolled", "Sessions held", "Attendance rate", "Unduplicated served"];
      rows = [...byFunder.entries()]
        .sort((x, y) => x[0].localeCompare(y[0]))
        .map(([funder, f]) => [
          funder,
          f.programs,
          f.enrolled,
          f.sessionsHeld,
          f.total > 0 ? `${Math.round((f.present / f.total) * 100)}%` : "—",
          f.served.size,
        ]);
    }
  } else {
    // attendance summary per participant
    title = "Attendance Summary";
    const name = new Map(participants.map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
    const grade = new Map(participants.map((p) => [p.id, p.grade ?? "—"]));
    const byPart = new Map<string, { present: number; late: number; absent: number }>();
    for (const r of attendance) {
      const cur = byPart.get(r.participant_id) ?? { present: 0, late: 0, absent: 0 };
      if (r.status === "present") cur.present++;
      else if (r.status === "late") cur.late++;
      else if (r.status === "absent") cur.absent++;
      byPart.set(r.participant_id, cur);
    }
    columns = ["Participant", "Grade", "Present", "Late", "Absent", "Attendance rate"];
    rows = [...byPart.entries()]
      .map(([pid, c]) => {
        const denom = c.present + c.late + c.absent;
        const rate = denom > 0 ? Math.round(((c.present + c.late) / denom) * 100) : 0;
        return {
          name: name.get(pid) ?? "—",
          row: [name.get(pid) ?? "—", grade.get(pid) ?? "—", c.present, c.late, c.absent, `${rate}%`] as (string | number)[],
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((x) => x.row);
  }

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
