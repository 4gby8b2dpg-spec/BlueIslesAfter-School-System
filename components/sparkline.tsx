// Presentational SVG sparkline (server component). Points are numeric values,
// null = a gap (e.g. a period/session with no data). Renders nothing under 2 points.
// By default it frames percentages (0–100, floor pulled to ≤60 so high rates
// aren't flat). Pass yMin/yMax to frame an arbitrary domain, e.g. counts [0, max].
// Opt into `grid` for faint horizontal guides + top/mid/bottom value labels
// (`unit` is appended to those labels, e.g. "%"). Callers that omit grid render
// exactly as before.
export function Sparkline({
  points,
  label = "Trend",
  yMin,
  yMax,
  grid = false,
  unit = "",
  area = false,
}: {
  points: (number | null)[];
  label?: string;
  yMin?: number;
  yMax?: number;
  grid?: boolean;
  unit?: string;
  area?: boolean;
}) {
  if (points.length < 2) return null;
  const present = points.filter((p): p is number => p != null);
  const max = yMax ?? 100;
  const min = yMin ?? Math.min(60, ...(present.length ? present : [60]));
  const w = 260;
  const h = 60;
  const step = w / (points.length - 1);
  const y = (v: number) => h - ((v - min) / (max - min || 1)) * h;
  const coords = points
    .map((p, i) => (p == null ? null : `${i * step},${y(p).toFixed(1)}`))
    .filter(Boolean) as string[];
  const last = points
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p != null)
    .pop();

  // horizontal guides at quarters of the domain
  const gridYs = grid ? [0, 0.25, 0.5, 0.75, 1].map((f) => h * f) : [];
  const fmt = (v: number) => `${Math.round(v * 10) / 10}${unit}`;

  // Optional soft fill under the line. Built from the drawn points only, so a
  // gap in the data doesn't drag the shape down to the baseline.
  const gradId = `spark-fill-${label.replace(/[^a-z0-9]/gi, "").slice(0, 24)}`;
  const areaPath =
    area && coords.length >= 2
      ? `M${coords[0].split(",")[0]},${h} L${coords.join(" L")} L${coords[coords.length - 1].split(",")[0]},${h} Z`
      : null;

  const svg = (
    <svg
      className="spark"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {areaPath && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0D9488" stopOpacity="0.22" />
            <stop offset="1" stopColor="#0D9488" stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {gridYs.map((gy, i) => (
        <line
          key={i}
          className="spark-grid-line"
          x1="0"
          x2={w}
          y1={gy}
          y2={gy}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke="#0D9488"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && last.p != null && <circle cx={last.i * step} cy={y(last.p)} r="3.6" fill="#D97706" />}
    </svg>
  );

  if (!grid) return svg;

  return (
    <div className="spark-wrap">
      <div className="spark-axis" aria-hidden="true">
        <span>{fmt(max)}</span>
        <span>{fmt((max + min) / 2)}</span>
        <span>{fmt(min)}</span>
      </div>
      {svg}
    </div>
  );
}
