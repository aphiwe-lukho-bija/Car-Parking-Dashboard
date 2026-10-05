import type { Server } from "node:http";
import type { RawData } from "ws";
import type {
  CheckInRequest,
  CheckoutRequest,
  ClientEvent,
  ServerEvent,
  VehicleType,
} from "../../shared/types";
import { VEHICLE_TYPES } from "../../shared/types";
import { getAnalytics } from "../services/analyticsService";
import {
  checkIn,
  checkOut,
  getLotStats,
  getSpaces,
} from "../services/parkingService";
import { loadSnapshot } from "../services/snapshotService";
import {
  onSessionEvent,
  publishSessionClosed,
  publishSessionOpened,
} from "../services/sessionEvents";
import { RealtimeHub } from "./hub";

export interface Realtime {
  hub: RealtimeHub;
  publishTick(): void;
}

const PLATE_PATTERN = /^[A-Za-z0-9]{5,10}$/;

function isVehicleType(value: unknown): value is VehicleType {
  return (
    typeof value === "string" &&
    (VEHICLE_TYPES as readonly string[]).includes(value)
  );
}

function parseCheckIn(payload: unknown): CheckInRequest | null {
  if (typeof payload !== "object" || payload === null) return null;

  const candidate = payload as Record<string, unknown>;
  const spaceNumber = candidate.spaceNumber;
  const numberPlate = candidate.numberPlate;
  const vehicleType = candidate.vehicleType;

  if (typeof spaceNumber !== "string" || spaceNumber.trim() === "") return null;
  if (typeof numberPlate !== "string") return null;
  if (!PLATE_PATTERN.test(numberPlate.trim())) return null;
  if (!isVehicleType(vehicleType)) return null;

  return {
    spaceNumber: spaceNumber.trim().toUpperCase(),
    numberPlate: numberPlate.trim().toUpperCase(),
    vehicleType,
  };
}

function parseCheckout(payload: unknown): CheckoutRequest | null {
  if (typeof payload !== "object" || payload === null) return null;

  const spaceNumber = (payload as Record<string, unknown>).spaceNumber;
  if (typeof spaceNumber !== "string" || spaceNumber.trim() === "") return null;

  return { spaceNumber: spaceNumber.trim().toUpperCase() };
}

/** Validates an inbound frame. Anything unrecognised is dropped, not thrown. */
function parseClientEvent(raw: RawData): ClientEvent | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw.toString());
  } catch {
    return null;
  }

  if (typeof decoded !== "object" || decoded === null) return null;

  const { type, payload } = decoded as Record<string, unknown>;

  if (type === "checkin") {
    const parsed = parseCheckIn(payload);
    return parsed === null ? null : { type: "checkin", payload: parsed };
  }
  if (type === "checkout") {
    const parsed = parseCheckout(payload);
    return parsed === null ? null : { type: "checkout", payload: parsed };
  }
  return null;
}

function errorEvent(code: string, message: string): ServerEvent {
  return { type: "error", payload: { code, message } };
}

export function createRealtime(server: Server): Realtime {
  const hub = new RealtimeHub(server, {
    onConnect: async (socket) => {
      const snapshot = await loadSnapshot();
      hub.send(socket, { type: "snapshot", payload: snapshot } satisfies ServerEvent);
    },

    onMessage: async (socket, raw) => {
      const event = parseClientEvent(raw);
      if (event === null) return;

      try {
        if (event.type === "checkin") {
          const result = await checkIn(
            event.payload.spaceNumber,
            event.payload.numberPlate,
            event.payload.vehicleType,
          );
          const stats = await getLotStats(await getSpaces());
          publishSessionOpened({ ...result, stats });
          return;
        }

        const result = await checkOut(event.payload.spaceNumber);
        const stats = await getLotStats(await getSpaces());
        publishSessionClosed({ ...result, stats });
      } catch (error) {
        // Domain errors are reported back on the requesting socket only, so one
        // bad frame cannot desynchronise every other connected dashboard.
        const failure = error as { code?: string; message: string };
        hub.send(
          socket,
          errorEvent(failure.code ?? "internal_error", failure.message),
        );
      }
    },

    onClose: () => undefined,
  });

  // The bus is the only place session events are broadcast from, so REST, the
  // simulator and inbound sockets all reach every client identically.
  onSessionEvent("opened", (payload) => {
    hub.broadcast({
      type: "session.opened",
      payload,
    } satisfies ServerEvent);
  });

  onSessionEvent("closed", (payload) => {
    hub.broadcast({
      type: "session.closed",
      payload,
    } satisfies ServerEvent);
  });

  return {
    hub,

    async publishTick() {
      // Recomputing analytics on every push is wasteful, so the tick only
      // carries live stats and spaces; analytics refresh on connect and via
      // the REST endpoint.
      void (async () => {
        const spaces = await getSpaces();
        const stats = await getLotStats(spaces);
        const analytics = await getAnalytics(new Date(), stats.total);

        hub.broadcast({
          type: "tick",
          payload: { stats, spaces, analytics },
        } satisfies ServerEvent);
      })().catch((error: unknown) => {
        console.error("[realtime] tick publish failed:", error);
      });
    },
  };
}