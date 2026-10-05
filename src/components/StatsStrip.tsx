import { formatCurrency, formatDuration } from "@shared/format";
import type { LotStatsDto } from "@shared/types";
import { useCountUp } from "../hooks/useCountUp";

interface MetricProps {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "gold" | "emerald" | "rose";
  spark?: number[];
}

function Sparkline({ points, tone }: { points: number[]; tone: MetricProps["tone"] }) {
  if (points.length < 2) return null;

  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;

  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 30 - ((point - min) / span) * 26 - 2;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const stroke =
    tone === "gold"
      ? "var(--gold-400)"
      : tone === "emerald"
        ? "var(--emerald-400)"
        : tone === "rose"
          ? "var(--rose-400)"
          : "var(--sky-400)";

  return (
    <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Metric({ label, value, detail, tone = "default", spark }: MetricProps) {
  return (
    <article className={`metric metric--${tone}`}>
      <p className="metric__label">{label}</p>
      <p className="metric__value">{value}</p>
      {detail !== undefined && <p className="metric__detail">{detail}</p>}
      {spark !== undefined && <Sparkline points={spark} tone={tone} />}
    </article>
  );
}

export function StatsStrip({ stats, history }: { stats: LotStatsDto; history: number[] }) {
  const occupancy = useCountUp(stats.occupancyRate);
  const revenue = useCountUp(stats.revenueToday);
  const active = useCountUp(stats.activeSessions);

  return (
    <div className="stats">
      <Metric
        label="Occupancy"
        value={`${occupancy.toFixed(0)}%`}
        detail={`${stats.occupied} of ${stats.total} bays taken`}
        tone="gold"
        spark={history}
      />
      <Metric
        label="Vehicles on site"
        value={active.toFixed(0)}
        detail={`${stats.available} bays free`}
        tone="emerald"
      />
      <Metric
        label="Revenue today"
        value={formatCurrency(revenue)}
        detail={`${formatCurrency(stats.revenuePerSpace)} per bay`}
      />
      <Metric
        label="Average stay"
        value={formatDuration(stats.averageStayMinutes)}
        detail={
          stats.overstayCount > 0
            ? `${stats.overstayCount} past the daily maximum`
            : "Everyone within limits"
        }
        tone={stats.overstayCount > 0 ? "rose" : "default"}
      />
    </div>
  );
}