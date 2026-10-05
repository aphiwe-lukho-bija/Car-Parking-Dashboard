import type { VehicleType } from "../../shared/types";
import { env } from "../config/env";
import {
  checkIn,
  checkOut,
  getLotStats,
  getOldestActiveSessions,
  getSpaces,
  getVehicles,
  type VehicleRow,
} from "./parkingService";
import { getAnalytics } from "./analyticsService";
import { ensureOverstayer } from "./overstayService";
import { recordOccupancySnapshot } from "./parkingService";

export interface SimulationEvents {
  sessionOpened(payload: {
    session: Awaited<ReturnType<typeof checkIn>>["session"];
    space: Awaited<ReturnType<typeof checkIn>>["space"];
    stats: Awaited<ReturnType<typeof getLotStats>>;
  }): void;

  sessionClosed(payload: Awaited<ReturnType<typeof checkOut>> & {
    stats: Awaited<ReturnType<typeof getLotStats>>;
  }): void;

  tick(): void;
}

const SNAPSHOT_EVERY_MS = 5 * 60_000;

function pick<T>(items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

function compatibleVehicles(
  vehicles: readonly VehicleRow[],
  type: VehicleType,
): VehicleRow[] {
  const exact = vehicles.filter((vehicle) => vehicle.type === type);
  return exact.length > 0 ? exact : [];
}

/**
 * Drives the facility's "busyness".
 *
 * Every tick performs a real database transaction — the same `checkIn` and
 * `checkOut` the HTTP API uses — and then notifies clients. There is no
 * separate in-memory model of occupancy, so the 3D scene, the REST responses
 * and MySQL can never disagree.
 */
export function startSimulation(events: SimulationEvents): () => void {
  if (!env.simulation.enabled) {
    console.log("[simulation] disabled via SIMULATION_ENABLED");
    return () => undefined;
  }

  let vehiclesCache: VehicleRow[] = [];
  let busy = false;
  let stopped = false;
  let lastSnapshotAt = 0;

  const refreshVehicles = async (): Promise<void> => {
    if (vehiclesCache.length > 0) return;
    vehiclesCache = await getVehicles();
  };

  const simulateArrival = async (): Promise<boolean> => {
    await refreshVehicles();

    const spaces = await getSpaces();
    const free = spaces.filter((space) => space.status === "available");
    const space = pick(free);
    if (space === undefined) return false;

    // A vehicle can only enter a bay it physically fits.
    const vehicle = pick(compatibleVehicles(vehiclesCache, space.type));
    if (vehicle === undefined) return false;

    const result = await checkIn(
      space.spaceNumber,
      vehicle.number_plate,
      vehicle.type,
    );
    const stats = await getLotStats(await getSpaces());

    events.sessionOpened({ ...result, stats });
    return true;
  };

  const simulateDeparture = async (): Promise<boolean> => {
    const active = await getOldestActiveSessions(40);
    const session = pick(active);
    if (session === undefined) return false;

    const spaces = await getSpaces();
    const space = spaces.find(
      (candidate) => candidate.session?.id === session.session_id,
    );
    if (space === undefined) return false;

    const result = await checkOut(space.spaceNumber, "card");
    const stats = await getLotStats(await getSpaces());

    events.sessionClosed({ ...result, stats });
    return true;
  };

  const tickOnce = async (): Promise<void> => {
    const stats = await getLotStats(await getSpaces());
    const rate = stats.total === 0 ? 0 : stats.occupied / stats.total;

    // Steer towards the target occupancy rather than acting randomly, so the
    // lot neither fills solid nor empties out during a long demo.
    const wantArrival =
      rate < env.simulation.targetOccupancy
        ? Math.random() < env.simulation.arrivalBias + 0.25
        : Math.random() < 1 - env.simulation.arrivalBias;

    if (wantArrival) await simulateArrival();
    else await simulateDeparture();
  };

  const simulateTimer = setInterval(() => {
    if (busy || stopped) return;
    busy = true;
    void tickOnce()
      .catch((error: unknown) => {
        console.error("[simulation] tick failed:", error);
      })
      .finally(() => {
        busy = false;
      });
  }, env.simulation.tickMs);

  const pushTimer = setInterval(() => {
    if (stopped) return;
    void events.tick();
  }, env.simulation.pushMs);

  const snapshotTimer = setInterval(() => {
    if (stopped) return;
    const now = Date.now();
    if (now - lastSnapshotAt < SNAPSHOT_EVERY_MS) return;
    lastSnapshotAt = now;
    void recordOccupancySnapshot().catch((error: unknown) => {
      console.error("[simulation] snapshot failed:", error);
    });
  }, 60_000);

  // Guarantee a tow candidate exists before anything else, and re-assert it
  // periodically so a demo can never end up with nothing to enforce.
  const guaranteeOverstayer = async (): Promise<void> => {
    try {
      const created = await ensureOverstayer();
      if (created) console.log("[simulation] staged an overstay candidate");
    } catch (error) {
      console.error("[simulation] overstayer check failed:", error);
    }
  };

  void guaranteeOverstayer();
  const overstayTimer = setInterval(() => void guaranteeOverstayer(), 60_000);

  // An immediate snapshot so the occupancy trend chart is populated from the
  // moment the server comes up.
  void recordOccupancySnapshot()
    .then(() => {
      lastSnapshotAt = Date.now();
    })
    .catch(() => undefined);

  console.log(
    `[simulation] running every ${env.simulation.tickMs}ms, ` +
      `target occupancy ${Math.round(env.simulation.targetOccupancy * 100)}%`,
  );

  return () => {
    stopped = true;
    clearInterval(simulateTimer);
    clearInterval(pushTimer);
    clearInterval(snapshotTimer);
    clearInterval(overstayTimer);
  };
}

export { getAnalytics };