"use client";

import * as XLSX from "xlsx";

export function ReportActions({
  filename,
  sheetName,
  columns,
  rows,
}: {
  filename: string;
  sheetName: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  function exportExcel() {
    const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    XLSX.writeFile(wb, filename);
  }

  return (
    <div className="report-actions">
      <button className="btn-ghost" type="button" onClick={() => window.print()}>
        Print / Save as PDF
      </button>
      <button className="btn-primary" type="button" onClick={exportExcel}>
        Export to Excel
      </button>
    </div>
  );
}
