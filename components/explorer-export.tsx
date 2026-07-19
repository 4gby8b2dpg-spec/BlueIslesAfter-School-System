"use client";

import * as XLSX from "xlsx";

// Downloads the current Explorer slice as an .xlsx file. Mirrors ReportActions
// so exports look identical across Reports and the Explorer.
export function ExplorerExport({
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
    <button className="btn-ghost btn-sm" type="button" onClick={exportExcel}>
      Export to Excel
    </button>
  );
}
