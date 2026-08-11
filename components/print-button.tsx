"use client";

// Triggers the browser's print dialog (which doubles as "Save as PDF").
// Client-only because window.print isn't available during SSR.
export function PrintButton({
  label = "Print",
  className = "btn-ghost",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      {label}
    </button>
  );
}
