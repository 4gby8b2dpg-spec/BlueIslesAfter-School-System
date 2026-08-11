"use client";

// Rasterize an on-page SVG chart to a PNG download — no dependencies, no
// network. Serializes the target's <svg>, paints it onto a canvas over a white
// background at 2x for crisp output, and triggers a download. CSP-safe (only a
// blob: URL is created).
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
  function onClick() {
    const host = document.getElementById(targetId);
    const svg = host?.querySelector("svg");
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));

    const data = new XMLSerializer().serializeToString(clone);
    const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(data);

    const scale = 2;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const cx = canvas.getContext("2d");
      if (!cx) return;
      cx.fillStyle = "#ffffff";
      cx.fillRect(0, 0, canvas.width, canvas.height);
      cx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    img.src = svgUrl;
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {label}
    </button>
  );
}
