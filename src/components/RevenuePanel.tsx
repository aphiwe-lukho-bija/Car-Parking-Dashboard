import { useCallback, useEffect, useRef, useState } from "react";
import type { RevenueDto } from "@shared/types";
import { formatCurrency, formatDuration, formatPlate } from "@shared/format";
import { api } from "../api/client";
import { useLotStore } from "../store/useLotStore";
import { Badge, EmptyState, Panel, PanelTitle } from "./Panel";

const REFRESH_MS = 15_000;

/**
 * Where the money is coming from, and what is currently unpaid.
 *
 * Deliberately splits collected revenue from money that is merely accrued.
 * Conflating the two is how a lot ends up looking busy and profitable while
 * thirty cars sit there owing money nobody has asked for yet.
 */
export function RevenuePanel() {
  const revenue = useLotStore((state) => state.revenue);
  const setRevenue = useLotStore((state) => state.setRevenue);

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    // Guard against a manual click and the interval landing together, which
    // would otherwise stack two identical three-query requests.
    if (inFlight.current) return;

    inFlight.current = true;
    setRefreshing(true);
    try {
      setRevenue(await api.revenue());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load revenue.");
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, [setRevenue]);

  useEffect(() => {
    // The initial fetch happens during store hydration; this only keeps the
    // figures fresh afterwards.
    const timer = window.setInterval(() => {
      // A hidden tab does not need live money figures, and skipping it stops
      // the dashboard quietly accruing database load in the background.
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [refresh]);

  if (revenue === null) {
    return (
      <Panel title="Revenue">
        <EmptyState message={error ?? "Loading today's takings…"} />
      </Panel>
    );
  }

  const { currency } = revenue;
  const worst = revenue.atRiskDetail.slice(0, 6);

  return (
    <Panel
      title="Money in, today"
      subtitle={`${revenue.sessionsToday} settled · ${currency}`}
      action={
        <button
          type="button"
          className="ghost"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      }
    >
      <div className="money">
        <div className="money__headline">
          <span className="money__value">{formatCurrency(revenue.collectedToday, currency)}</span>
          <span className="money__caption">collected</span>
        </div>

        <dl className="money__stats">
          <div>
            <dt>Avg ticket</dt>
            <dd>{formatCurrency(revenue.averageTicket, currency)}</dd>
          </div>
          <div>
            <dt>Per bay</dt>
            <dd>{formatCurrency(revenue.yieldPerSpace, currency)}</dd>
          </div>
        </dl>
      </div>

      <PanelTitle>Income streams</PanelTitle>
      <ul className="streams">
        {revenue.streams.map((stream) => (
          <li key={stream.key} className={`streams__row streams__row--${stream.key}`}>
            <span className="streams__label">{stream.label}</span>
            <span className="streams__value">
              {formatCurrency(stream.amount, currency)}
            </span>
          </li>
        ))}
      </ul>
      {revenue.streams.slice(1).every((stream) => stream.amount === 0) && (
        <p className="hint hint--muted">
          Enforcement income starts at zero until overstay penalties and towing
          go live. That gap is the point of the next phase.
        </p>
      )}

      <PanelTitle>Unpaid, sitting on the lot</PanelTitle>
      <div className="risk">
        <div className="risk__figure">
          <strong>{formatCurrency(revenue.atRisk, currency)}</strong>
          <span>across {revenue.atRiskVehicles} vehicles</span>
        </div>

        {revenue.cappedExposure > 0 ? (
          <p className="hint hint--warn">
            {formatCurrency(revenue.cappedExposure, currency)} of that comes from
            cars that already hit their daily cap. They owe no more, so every
            extra hour they hold a bay is pure lost capacity.
          </p>
        ) : (
          <p className="hint hint--muted">
            Nobody has hit their daily cap yet, so nothing here is yet worth a
            tow.
          </p>
        )}

        {worst.length > 0 && (
          <ul className="risk__list">
            {worst.map((vehicle) => (
              <li key={vehicle.sessionId}>
                <div>
                  <span className="risk__plate">{formatPlate(vehicle.numberPlate)}</span>
                  <span className="risk__bay">{vehicle.spaceNumber}</span>
                </div>
                <div className="risk__figures">
                  <span>{formatCurrency(vehicle.accruedFee, currency)}</span>
                  {vehicle.cappedToday ? (
                    <Badge tone="danger">
                      capped · {formatDuration(vehicle.minutesOverCap ?? 0)} over
                    </Badge>
                  ) : (
                    <Badge tone="neutral">{vehicle.vehicleType}</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PanelTitle>Takings by hour</PanelTitle>
      <RevenueByHour revenue={revenue} />
    </Panel>
  );
}

function RevenueByHour({ revenue }: { revenue: RevenueDto }) {
  const max = Math.max(...revenue.hourlyToday.map((point) => point.revenue), 1);
  const nowHour = new Date().getHours();

  return (
    <div className="bars bars--hourly">
      {revenue.hourlyToday.map((point) => (
        <div
          className="bars__column"
          key={point.hour}
          title={`${String(point.hour).padStart(2, "0")}:00 — ${formatCurrency(point.revenue, revenue.currency)} · ${point.sessions} sessions`}
        >
          <div className="bars__track">
            <div
              className={`bars__fill ${point.hour === nowHour ? "bars__fill--today" : ""}`}
              style={{ height: `${point.revenue === 0 ? 0 : Math.max(4, (point.revenue / max) * 100)}%` }}
            />
          </div>
          {point.hour % 3 === 0 && (
            <span className="bars__label">{String(point.hour).padStart(2, "0")}</span>
          )}
        </div>
      ))}
    </div>
  );
}