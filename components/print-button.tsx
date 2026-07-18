"use client";

export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn-primary cert-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
