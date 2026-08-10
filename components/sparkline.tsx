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

  // Split into contiguous runs of real data. A null breaks the run, so a
  // missing period renders as an actual gap rather than a bridged segment.
  type Pt = { x: number; y: number };
  const segments: Pt[][] = [];
  let run: Pt[] = [];
  points.forEach((p, i) => {
    if (p == null) {
      if (run.length) segments.push(run);
      run = [];
    } else {
      run.push({ x: i * step, y: y(p) });
    }
  });
  if (run.length) segments.push(run);

  const lineFor = (seg: Pt[]) => seg.map((pt) => `${pt.x},${pt.y.toFixed(1)}`).join(" ");
  const last = segments.at(-1)?.at(-1);

  // horizontal guides at quarters of the domain
  const gridYs = grid ? [0, 0.25, 0.5, 0.75, 1].map((f) => h * f) : [];
  const fmt = (v: number) => `${Math.round(v * 10) / 10}${unit}`;

  // Optional soft fill under each drawn segment, so a gap doesn't drag the
  // shape down to the baseline and no fill spans a missing period.
  const gradId = `spark-fill-${label.replace(/[^a-z0-9]/gi, "").slice(0, 24)}`;
  const areaFor = (seg: Pt[]) =>
    `M${seg[0].x},${h} L${lineFor(seg).split(" ").join(" L")} L${seg[seg.length - 1].x},${h} Z`;

  const svg = (
    <svg
      className="spark"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {area && (
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
      {area &&
        segments
          .filter((seg) => seg.length >= 2)
          .map((seg, i) => <path key={`a${i}`} d={areaFor(seg)} fill={`url(#${gradId})`} />)}
      {segments.map((seg, i) =>
        seg.length >= 2 ? (
          <polyline
            key={`l${i}`}
            points={lineFor(seg)}
            fill="none"
            stroke="#0D9488"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          // a lone datapoint between gaps still deserves a mark
          <circle key={`d${i}`} cx={seg[0].x} cy={seg[0].y} r="2.4" fill="#0D9488" />
        ),
      )}
      {last && <circle cx={last.x} cy={last.y} r="3.6" fill="#D97706" />}
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
