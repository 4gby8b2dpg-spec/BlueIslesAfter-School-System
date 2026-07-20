import * as XLSX from "xlsx";
import type { Report } from "@/lib/reports";

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

export function reportToXlsxBase64(report: Report): string {
  const ws = XLSX.utils.aoa_to_sheet([report.columns, ...report.rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, report.title.slice(0, 31));
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
}
