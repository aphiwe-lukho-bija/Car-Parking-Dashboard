import { formatCurrency } from "@shared/format";
import { useLotStore } from "../store/useLotStore";
import { Badge } from "./Panel";

const CONNECTION_COPY = {
  connecting: { tone: "warn", label: "Connecting" },
  live: { tone: "live", label: "Live" },
  reconnecting: { tone: "warn", label: "Reconnecting" },
  offline: { tone: "danger", label: "Offline" },
} as const;

export function Header() {
  const facility = useLotStore((state) => state.facility);
  const stats = useLotStore((state) => state.stats);
  const connection = useLotStore((state) => state.connection);
  const analytics = useLotStore((state) => state.analytics);
  const visualQuality = useLotStore((state) => state.visualQuality);
  const setVisualQuality = useLotStore((state) => state.setVisualQuality);

  const badge = CONNECTION_COPY[connection];

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__mark" aria-hidden="true">
          P
        </span>
        <div>
          <h1 className="topbar__title">
            {facility?.name ?? "Apex Parking"}
          </h1>
          <p className="topbar__sub">
            {facility !== null
              ? `${facility.city} · live operations`
              : "Connecting to the facility…"}
          </p>
        </div>
      </div>

      <div className="topbar__figures">
        {stats !== null && (
          <>
            <div className="topbar__figure">
              <span>Today</span>
              <strong>{formatCurrency(stats.revenueToday)}</strong>
            </div>
            <div className="topbar__figure">
              <span>All time</span>
              <strong>
                {analytics !== null ? formatCurrency(analytics.totalRevenue) : "—"}
              </strong>
            </div>
            <div className="topbar__figure">
              <span>Sessions</span>
              <strong>{analytics !== null ? analytics.totalSessions.toLocaleString() : "—"}</strong>
            </div>
          </>
        )}
      </div>

      <div className="topbar__tools">
        <button
          type="button"
          className="quality-toggle"
          onClick={() => setVisualQuality(visualQuality === "high" ? "lite" : "high")}
          title={
            visualQuality === "high"
              ? "Full effects: ambient occlusion, bloom, depth of field. Switch to Lite for slower machines."
              : "Lite: no ambient occlusion or antialiasing pass. Switch back to Full for presentations."
          }
        >
          <span className="quality-toggle__dot" aria-hidden="true" />
          {visualQuality === "high" ? "Full" : "Lite"}
        </button>

        <Badge tone={badge.tone}>
          <span className={`dot dot--${connection}`} aria-hidden="true" />
          {badge.label}
        </Badge>
      </div>
    </header>
  );
}