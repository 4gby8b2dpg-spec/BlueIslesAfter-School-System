// Presentational SVG sparkline (server component). Points are 0–100 values,
// null = a gap (e.g. a period/session with no data). Renders nothing under 2 points.
export function Sparkline({
  points,
  label = "Trend",
}: {
  points: (number | null)[];
  label?: string;
}) {
  if (points.length < 2) return null;
  const present = points.filter((p): p is number => p != null);
  const max = 100;
  const min = Math.min(60, ...(present.length ? present : [60]));
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

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
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
}
