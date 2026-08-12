"use client";

import { svgElementToPngDataUrl } from "@/lib/svg-to-png";

// Rasterize an on-page SVG chart to a PNG download — no dependencies, no
// network. Shares the SVG→canvas conversion with the narrative builder's
// chart-capture button (lib/svg-to-png.ts) instead of forking it.
export function PngExportButton({
  targetId,
  filename,
  label = "PNG",
  className = "btn-ghost",
}: {
  targetId: string;
  filename: string;
  label?: string;
  className?: string;
}) {
  async function onClick() {
    const host = document.getElementById(targetId);
    const svg = host?.querySelector("svg");
    if (!svg) return;

    const dataUrl = await svgElementToPngDataUrl(svg);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
    a.click();
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {label}
    </button>
  );
}
