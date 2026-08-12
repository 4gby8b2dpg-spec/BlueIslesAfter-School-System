// Rasterize an on-page SVG element to a PNG — shared by PngExportButton
// (triggers a download) and the narrative builder's chart capture (keeps the
// data URL in-memory to embed in a block). No dependencies: serializes the
// SVG, paints it onto a canvas over a white background at 2x for crisp
// output.
export function svgElementToPngDataUrl(svg: SVGSVGElement): Promise<string> {
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
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const cx = canvas.getContext("2d");
      if (!cx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      cx.fillStyle = "#ffffff";
      cx.fillRect(0, 0, canvas.width, canvas.height);
      cx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Failed to rasterize SVG"));
    img.src = svgUrl;
  });
}
