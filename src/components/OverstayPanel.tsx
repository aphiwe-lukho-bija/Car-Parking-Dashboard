import { useCallback, useEffect, useRef, useState } from "react";
import { formatCurrency, formatPlate } from "@shared/format";
import { VEHICLE_TYPE_LABELS, type OverstayTarget } from "@shared/types";
import { api, ApiRequestError } from "../api/client";
import { useLotStore } from "../store/useLotStore";
import { Badge, EmptyState, Panel, PanelTitle } from "./Panel";

const REFRESH_MS = 15_000;

/**
 * Overstay enforcement.
 *
 * The always-present tow candidate, with the money owed against it, and the
 * control that acts on it. This is the panel you point at when demonstrating
 * what happens to a vehicle that ignores its parking limit — pressing the tow
 * button settles the balance, clears the bay and starts the removal in the
 * 3D lot.
 */
export function OverstayPanel() {
  const revenue = useLotStore((state) => state.revenue);
  const selectBay = useLotStore((state) => state.selectBay);
  const setRevenue = useLotStore((state) => state.setRevenue);
  const tow = useLotStore((state) => state.tow);
  const pendingBays = useLotStore((state) => state.pendingBays);

  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      setRevenue(await api.revenue());
    } catch {
      // The panel simply keeps the last known figures; a transient failure
      // should never blank out the thing being demonstrated.
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, [setRevenue]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const authorise = useCallback(
    async (target: OverstayTarget) => {
      setFailure(null);
      try {
        await tow(target.spaceNumber);
        // The broadcast that follows clears the target and starts the tow in
        // the scene; the panel's own refresh catches up with the money.
        await refresh();
      } catch (error) {
        setFailure(
          error instanceof ApiRequestError
            ? error.message
            : "Could not authorise the tow.",
        );
      }
    },
    [refresh, tow],
  );

  const targets = revenue?.overstayTargets ?? [];
  const owedFor = (sessionId: number): number | null => {
    const match = revenue?.atRiskDetail.find((v) => v.sessionId === sessionId);
    return match?.accruedFee ?? null;
  };

  return (
    <Panel
      title="Overstay enforcement"
      subtitle={
        targets.length === 0
          ? "No vehicle currently past its limit"
          : `${targets.length} vehicle${targets.length === 1 ? "" : "s"} past the limit`
      }
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
      {revenue === null ? (
        <EmptyState message="Checking vehicles against their stay limit…" />
      ) : targets.length === 0 ? (
        <EmptyState message="Nothing to enforce. Every vehicle is inside its window." />
      ) : (
        <>
          <ul className="targets">
            {targets.map((target) => {
              const owed = owedFor(target.sessionId);
              const pending = pendingBays.includes(target.spaceNumber);

              return (
                <li key={target.sessionId} className="targets__item">
                  <div className="targets__row">
                    <button
                      type="button"
                      className="targets__body"
                      onClick={() => selectBay(target.spaceNumber)}
                    >
                      <div className="targets__top">
                        <span className="targets__plate">
                          {formatPlate(target.numberPlate)}
                        </span>
                        <Badge tone="danger">
                          {target.hoursOverstayed}h over
                        </Badge>
                      </div>
                      <div className="targets__meta">
                        <span>Bay {target.spaceNumber}</span>
                        <span>{VEHICLE_TYPE_LABELS[target.vehicleType]}</span>
                        {owed !== null && (
                          <span className="targets__owed">
                            {formatCurrency(owed)} owed
                          </span>
                        )}
                      </div>
                    </button>

                    <button
                      type="button"
                      className="targets__tow"
                      onClick={() => void authorise(target)}
                      disabled={pending}
                    >
                      {pending ? (
                        <>
                          <span className="spinner" aria-hidden="true" />
                          Towing
                        </>
                      ) : (
                        <>
                          <span aria-hidden="true">⤴</span>
                          Authorise tow
                        </>
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {failure !== null && (
            <p className="targets__error" role="alert">
              {failure}
            </p>
          )}

          <PanelTitle>What happens next</PanelTitle>
          <ol className="enforce">
            <li>Driver is billed per calendar day, capped, for every day it squats.</li>
            <li>Beyond the cap the car earns the facility nothing — the bay is lost capacity.</li>
            <li>The tow is authorised above; the truck removes the vehicle and impounds it.</li>
            <li>Release requires settling the outstanding balance in full.</li>
          </ol>
        </>
      )}
    </Panel>
  );
}