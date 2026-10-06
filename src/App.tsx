import { Suspense, lazy, useEffect, useState } from "react";
import { PricingTable } from "./components/PricingTable";
import { RevenuePanel } from "./components/RevenuePanel";
import { ReplayPanel } from "./components/ReplayPanel";
import { OverstayPanel } from "./components/OverstayPanel";
import { ActivityFeed } from "./components/ActivityFeed";
import {
  DurationBreakdown,
  OccupancyChart,
  PeakHoursChart,
  RevenueChart,
  VehicleMix,
} from "./components/Charts";
import { StatsStrip } from "./components/StatsStrip";
import { Header } from "./components/Header";
import { Panel } from "./components/Panel";
import { BayGrid } from "./components/BayGrid";
import { BayInspector } from "./components/BayInspector";
import { PaymentKiosk } from "./components/PaymentKiosk";
// Three.js is a ~1MB dependency and is not needed to paint the dashboard, so
// the lot is code-split and streams in behind the stats and activity panels.
const ParkingLot = lazy(async () => {
  const module = await import("./three/ParkingLot");
  return { default: module.ParkingLot };
});
import { useParkingFeed } from "./hooks/useParkingFeed";
import { useLotStore } from "./store/useLotStore";
import { LoginScreen } from "./components/LoginScreen";

type View = "lot" | "grid";

/**
 * The console itself, mounted only for a signed-in operator.
 *
 * Everything that talks to the API — the hydrate call and the live feed —
 * lives here rather than in `App`, so an unauthenticated visitor never fires a
 * request that would come back 401.
 */
function Dashboard() {
  const hydrate = useLotStore((state) => state.hydrate);
  const analytics = useLotStore((state) => state.analytics);
  const stats = useLotStore((state) => state.stats);
  const spaces = useLotStore((state) => state.spaces);
  const connection = useLotStore((state) => state.connection);

  const [view, setView] = useState<View>("lot");
  const [fatal, setFatal] = useState<string | null>(null);

  useParkingFeed();

  useEffect(() => {
    let cancelled = false;

    hydrate().catch((cause: unknown) => {
      if (cancelled) return;
      setFatal(
        cause instanceof Error
          ? cause.message
          : "Could not reach the parking API.",
      );
    });

    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  // The server has already been reached once the socket is live, so a
  // transient socket failure should not blank out the dashboard.
  const offline =
    fatal !== null ||
    (connection === "offline" && stats === null && spaces.length === 0);

  if (offline) {
    return (
      <div className="app app--error">
        <div className="fatal">
          <h1>Apex Parking is unreachable</h1>
          <p>
            {fatal ?? "The API did not respond and the live feed is offline."}
          </p>
          <p className="muted">
            Start the backend with <code>npm run dev:server</code>, then reload.
          </p>
          <button className="button" type="button" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const occupancyHistory =
    analytics?.occupancyHistory.map((point) => point.occupancyRate) ?? [];

  return (
    <div className="app">
      <Header />

      <main className="layout">
        <section className="layout__stage">
          {stats !== null && <StatsStrip stats={stats} history={occupancyHistory} />}

          <div className="stage">
            {view === "lot" ? (
              <div className="stage__canvas">
                <Suspense
                  fallback={
                    <div className="stage__loading">
                      <span className="spinner" aria-hidden="true" />
                      <p>Building the lot…</p>
                    </div>
                  }
                >
                  <ParkingLot />
                </Suspense>
              </div>
            ) : (
              <div className="stage__grid">
                <Panel title="Bay register" subtitle="Every space on site, live">
                  <BayGrid />
                </Panel>
              </div>
            )}

            <div className="stage__switch" role="tablist" aria-label="Lot view">
              <button
                type="button"
                role="tab"
                aria-selected={view === "lot"}
                className={view === "lot" ? "is-active" : ""}
                onClick={() => setView("lot")}
              >
                3D lot
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "grid"}
                className={view === "grid" ? "is-active" : ""}
                onClick={() => setView("grid")}
              >
                Bay grid
              </button>
            </div>

            <ul className="stage__legend">
              <li><span className="swatch swatch--free" />Available</li>
              <li><span className="swatch swatch--taken" />Occupied</li>
              <li><span className="swatch swatch--selected" />Selected</li>
            </ul>
          </div>
        </section>

        <aside className="layout__rail">
          <BayInspector />
          <ActivityFeed />

          <OverstayPanel />
          <RevenuePanel />
          <ReplayPanel />

          {analytics !== null && (
            <>
              <Panel title="Occupancy, last 24 hours">
                <OccupancyChart points={analytics.occupancyHistory} />
              </Panel>

              <Panel title="Revenue by day" subtitle="Last 14 days">
                <RevenueChart points={analytics.revenueByDay} />
              </Panel>

              <Panel title="When the lot is busiest">
                <PeakHoursChart points={analytics.peakHours} />
              </Panel>

              <div className="rail__pair">
                <Panel title="Stay length">
                  <DurationBreakdown buckets={analytics.durationBuckets} />
                </Panel>
                <Panel title="Vehicle mix">
                  <VehicleMix points={analytics.vehicleMix} />
                </Panel>
              </div>

              <PricingTable />
            </>
          )}
        </aside>
      </main>
    </div>
  );
}

/** Gate: the operator console until a session exists, the login screen until one does. */
export function App() {
  const auth = useLotStore((state) => state.auth);
  const paymentKioskOpen = useLotStore((state) => state.paymentKioskOpen);

  if (auth === null) return <LoginScreen />;

  return (
    <>
      <Dashboard />
      {paymentKioskOpen && <PaymentKiosk />}
    </>
  );
}