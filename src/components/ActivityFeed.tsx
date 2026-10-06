import { useSyncExternalStore } from "react";
import { formatDuration, formatPlate } from "@shared/format";
import { VEHICLE_TYPE_LABELS } from "@shared/types";
import { clock } from "../lib/clock";
import { useLotStore } from "../store/useLotStore";
import { EmptyState, Panel } from "./Panel";

function relativeTime(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  return formatDuration(minutes);
}

export function ActivityFeed() {
  const activity = useLotStore((state) => state.activity);

  // Ticks once a second purely so the "12s ago" labels stay honest.
  const now = useSyncExternalStore(clock.subscribe, clock.getSnapshot);

  return (
    <Panel
      title="Live movements"
      subtitle="Every check-in and check-out, as it happens"
      padded={false}
    >
      {activity.length === 0 ? (
        <div className="panel__body">
          <EmptyState message="Waiting for the first movement…" />
        </div>
      ) : (
        <ul className="feed">
          {activity.slice(0, 14).map((item) => (
            <li key={item.id} className={`feed__row feed__row--${item.kind}`}>
              <span className="feed__icon" aria-hidden="true">
                {item.kind === "arrival" ? "↓" : item.kind === "tow" ? "T" : "↑"}
              </span>
              <span className="feed__body">
                <span className="feed__plate">{formatPlate(item.numberPlate)}</span>
                <span className="feed__meta">
                  {VEHICLE_TYPE_LABELS[item.vehicleType]} · bay {item.spaceNumber}
                </span>
              </span>
              <span className="feed__when">
                {item.kind === "arrival"
                  ? "arrived"
                  : item.kind === "tow"
                    ? "towed"
                    : "departed"}
                <small>{relativeTime(item.at, now)}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}