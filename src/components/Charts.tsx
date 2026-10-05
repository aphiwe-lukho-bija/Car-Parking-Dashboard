import type { OccupancyPoint, RevenuePoint } from "@shared/types";
import { formatCurrency } from "@shared/format";
import { EmptyState } from "./Panel";

/**
 * Occupancy over the last 24 hours as a filled area chart.
 *
 * Hand-drawn in SVG rather than pulled from a charting library: the whole
 * visual is one path, and a dependency would add far more bundle weight than
 * it saves.
 */
export function OccupancyChart({ points }: { points: OccupancyPoint[] }) {
  if (points.length < 2) {
    return <EmptyState message="Not enough history yet." />;
  }

  const width = 100;
  const height = 34;

  const toX = (index: number): number =>
    (index / (points.length - 1)) * width;

  const toY = (rate: number): number =>
    height - (rate / 100) * (height - 4) - 2;

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${toX(index)},${toY(point.occupancyRate)}`)
    .join(" ");

  const area = `${line} L${width},${height} L0,${height} Z`;

  const peak = points.reduce((best, point) =>
    point.occupancyRate > best.occupancyRate ? point : best,
  );

  const latest = points.at(-1);
  const first = points[0];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="chart__svg" aria-hidden="true">
        <defs>
          <linearGradient id="occupancy-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gold-400)" stopOpacity="0.42" />
            <stop offset="100%" stopColor="var(--gold-400)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="occupancy-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--gold-600)" />
            <stop offset="100%" stopColor="var(--gold-300)" />
          </linearGradient>
        </defs>

        {/* 50% reference line */}
        <line x1="0" x2={width} y1={toY(50)} y2={toY(50)} stroke="var(--line-strong)" strokeWidth="0.4" />

        <path d={area} fill="url(#occupancy-fill)" />
        <path
          d={line}
          fill="none"
          stroke="url(#occupancy-line)"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        {latest !== undefined && (
          <circle cx={toX(points.length - 1)} cy={toY(latest.occupancyRate)} r="1.4" fill="var(--gold-300)" />
        )}
      </svg>

      <div className="chart__axis">
        <span>{first !== undefined ? formatHour(first.at) : ""}</span>
        <span>{latest !== undefined ? `${latest.occupancyRate.toFixed(0)}% now` : ""}</span>
      </div>

      <p className="chart__note">
        Peaked at {peak.occupancyRate.toFixed(0)}% ·{" "}
        {new Date(peak.at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}

export function RevenueChart({ points }: { points: RevenuePoint[] }) {
  if (points.length === 0) return <EmptyState message="No revenue recorded yet." />;

  const max = Math.max(...points.map((point) => point.revenue), 1);

  return (
    <div className="bars">
      {points.map((point) => {
        const height = (point.revenue / max) * 100;
        const isToday = point.date === points.at(-1)?.date;

        return (
          <div className="bars__column" key={point.date} title={`${point.date}: ${formatCurrency(point.revenue)} · ${point.sessions} sessions`}>
            <div className="bars__track">
              <div
                className={`bars__fill ${isToday ? "bars__fill--today" : ""}`}
                style={{ height: `${Math.max(2, height)}%` }}
              />
            </div>
            <span className="bars__label">{point.date.slice(8)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function PeakHoursChart({ points }: { points: { hour: number; occupancyRate: number }[] }) {
  if (points.length === 0) return <EmptyState message="No traffic profile yet." />;

  const max = Math.max(...points.map((point) => point.occupancyRate), 1);
  const quietest = points.reduce((best, point) =>
    point.occupancyRate < best.occupancyRate ? point : best,
  );

  return (
    <>
      <div className="heatmap" role="img" aria-label="Average occupancy by hour of day">
        {points.map((point) => {
          const intensity = point.occupancyRate / max;
          return (
            <div
              key={point.hour}
              className="heatmap__cell"
              title={`${String(point.hour).padStart(2, "0")}:00 — ${point.occupancyRate.toFixed(0)}%`}
              style={{
                background: `color-mix(in oklab, var(--gold-500) ${Math.round(intensity * 92)}%, rgb(255 255 255 / 4%))`,
              }}
            />
          );
        })}
      </div>
      <div className="chart__axis">
        <span>00:00</span>
        <span>12:00</span>
        <span>23:00</span>
      </div>
      <p className="chart__note">
        Quietest at {String(quietest.hour).padStart(2, "0")}:00 —{" "}
        {quietest.occupancyRate.toFixed(0)}% average
      </p>
    </>
  );
}

export function DurationBreakdown({
  buckets,
}: {
  buckets: { label: string; count: number }[];
}) {
  if (buckets.length === 0) return <EmptyState message="No completed stays yet." />;

  const max = Math.max(...buckets.map((bucket) => bucket.count), 1);
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  return (
    <ul className="breakdown">
      {buckets.map((bucket) => (
        <li key={bucket.label} className="breakdown__row">
          <span className="breakdown__label">{bucket.label}</span>
          <span className="breakdown__track">
            <span
              className="breakdown__fill"
              style={{ width: `${(bucket.count / max) * 100}%` }}
            />
          </span>
          <span className="breakdown__value">
            {bucket.count}
            <small>{total > 0 ? ` · ${Math.round((bucket.count / total) * 100)}%` : ""}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function VehicleMix({ points }: { points: { type: string; count: number }[] }) {
  if (points.length === 0) return <EmptyState message="No vehicle records yet." />;

  const total = points.reduce((sum, point) => sum + point.count, 0);
  const palette = ["var(--gold-400)", "var(--sky-400)", "var(--violet-400)", "var(--emerald-400)"];

  return (
    <>
      <div className="mix">
        {points.map((point, index) => (
          <span
            key={point.type}
            className="mix__slice"
            style={{
              width: `${(point.count / total) * 100}%`,
              background: palette[index % palette.length],
            }}
            title={`${point.type}: ${point.count}`}
          />
        ))}
      </div>
      <ul className="mix__legend">
        {points.map((point, index) => (
          <li key={point.type}>
            <span className="mix__dot" style={{ background: palette[index % palette.length] }} />
            <span className="mix__name">{point.type}</span>
            <span className="mix__count">{point.count}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}