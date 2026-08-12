import * as XLSX from "xlsx";
import type { Report } from "@/lib/reports";
import type { NarrativeBlock } from "@/lib/narratives";

// Renders a Report for email: an inline-styled HTML table (email clients strip
// <style> blocks, so every rule is on the element) plus the same data as an
// .xlsx attachment, since that's the format staff actually work in.

function escapeHtml(v: string | number) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderReportHtml({
  report,
  orgName,
  rangeLabel,
  note,
}: {
  report: Report;
  orgName: string;
  rangeLabel: string;
  note?: string;
}) {
  const th =
    'style="text-align:left;padding:9px 12px;border-bottom:2px solid #0d9488;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#0b6e66;"';
  const td = 'style="padding:9px 12px;border-bottom:1px solid #e0e8e6;font-size:14px;color:#16292a;"';

  const head = report.columns.map((c) => `<th ${th}>${escapeHtml(c)}</th>`).join("");
  const body = report.rows
    .map(
      (r) =>
        `<tr>${r.map((cell) => `<td ${td}>${escapeHtml(cell)}</td>`).join("")}</tr>`,
    )
    .join("");

  const empty = `<tr><td ${td} colspan="${report.columns.length}">No data for this period.</td></tr>`;

  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#eef3f2;padding:24px;">
  <div style="max-width:760px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e0e8e6;">
    <div style="background:linear-gradient(103deg,#0d9488,#12787f);padding:22px 24px;color:#ffffff;">
      <div style="font-size:20px;font-weight:600;">${escapeHtml(report.title)}</div>
      <div style="font-size:13px;color:#cdeee8;margin-top:4px;">${escapeHtml(orgName)} &middot; ${escapeHtml(rangeLabel)}</div>
    </div>
    <div style="padding:20px 24px;">
      ${note ? `<p style="font-size:13.5px;color:#4a5c5a;margin:0 0 16px;">${escapeHtml(note)}</p>` : ""}
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>${head}</tr></thead>
        <tbody>${report.rows.length ? body : empty}</tbody>
      </table>
      <p style="font-size:12px;color:#6a7c7a;margin:18px 0 0;">
        The same figures are attached as an Excel file. Sent automatically by BlueIsles.
      </p>
    </div>
  </div>
</div>`;
}

// Narrative reports (FR-H.4) — same inline-styled-for-email approach as
// renderReportHtml, since it's rendered both on-screen and (in future) into
// an email body. KPI/chart blocks were snapshotted at add-time, so this is a
// pure render — no data lookups here.
export function renderNarrativeHtml({
  title,
  orgName,
  blocks,
}: {
  title: string;
  orgName: string;
  blocks: NarrativeBlock[];
}) {
  const body = blocks
    .map((b) => {
      if (b.type === "text") {
        return `<p style="font-size:14.5px;line-height:1.6;color:#16292a;margin:0 0 16px;white-space:pre-wrap;">${escapeHtml(b.body)}</p>`;
      }
      if (b.type === "kpi") {
        return `<div style="display:inline-block;margin:0 16px 16px 0;padding:16px 20px;border-radius:14px;background:#eef3f2;border:1px solid #e0e8e6;">
          <div style="font-size:28px;font-weight:700;color:#0b6e66;">${escapeHtml(b.value)}</div>
          <div style="font-size:12.5px;color:#4a5c5a;margin-top:2px;">${escapeHtml(b.label)}</div>
        </div>`;
      }
      // chart — dataUrl is attacker-reachable via the saveNarrative server
      // action (only typeof-checked, not content-checked), so only ever
      // accept it if it's actually a PNG data URL; escape it regardless.
      if (!b.dataUrl.startsWith("data:image/png;base64,")) return "";
      return `<figure style="margin:0 0 16px;">
        <img src="${escapeHtml(b.dataUrl)}" alt="${escapeHtml(b.label)}" style="max-width:100%;border-radius:10px;border:1px solid #e0e8e6;" />
        <figcaption style="font-size:12px;color:#6a7c7a;margin-top:6px;">${escapeHtml(b.label)}</figcaption>
      </figure>`;
    })
    .join("");

  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#eef3f2;padding:24px;">
  <div style="max-width:760px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e0e8e6;">
    <div style="background:linear-gradient(103deg,#7c5cbf,#5b3fa0);padding:22px 24px;color:#ffffff;">
      <div style="font-size:20px;font-weight:600;">${escapeHtml(title)}</div>
      <div style="font-size:13px;color:#e3d9f5;margin-top:4px;">${escapeHtml(orgName)}</div>
    </div>
    <div style="padding:20px 24px;">
      ${body || '<p style="color:#6a7c7a;">No content yet.</p>'}
    </div>
  </div>
</div>`;
}

export function reportToXlsxBase64(report: Report): string {
  const ws = XLSX.utils.aoa_to_sheet([report.columns, ...report.rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, report.title.slice(0, 31));
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
}
