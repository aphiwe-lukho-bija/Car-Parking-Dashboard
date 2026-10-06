import { EventEmitter } from "node:events";
import type { LotStatsDto, ParkingSpaceDto } from "../../shared/types";
import type { authoriseTow } from "./enforcementService";
import type { checkIn, checkOut } from "./parkingService";

export interface CheckInPayload {
  session: Awaited<ReturnType<typeof checkIn>>["session"];
  space: ParkingSpaceDto;
  stats: LotStatsDto;
}

export interface CheckOutPayload extends Awaited<ReturnType<typeof checkOut>> {
  stats: LotStatsDto;
}

export interface TowPayload extends Awaited<ReturnType<typeof authoriseTow>> {
  stats: LotStatsDto;
}

interface SessionEventMap {
  opened: CheckInPayload;
  closed: CheckOutPayload;
  towed: TowPayload;
}

const emitter = new EventEmitter();

/**
 * Single publish point for session lifecycle events.
 *
 * Every producer — the REST routes, inbound WebSocket frames and the traffic
 * simulator — publishes here, and the WebSocket layer is the only subscriber.
 * Centralising this means a car registered by hand in the dashboard reaches
 * every other connected client the same instant a simulated one does, instead
 * of waiting for the next stats push to incidentally reveal it.
 */
export function publishSessionOpened(payload: CheckInPayload): void {
  emitter.emit("opened", payload);
}

export function publishSessionClosed(payload: CheckOutPayload): void {
  emitter.emit("closed", payload);
}

/**
 * Published instead of `closed` when a vehicle is removed by enforcement, so a
 * client can tell a driver leaving of their own accord from a tow truck
 * hauling one off the lot — the money settles the same way, the scene does not.
 */
export function publishTowAuthorised(payload: TowPayload): void {
  emitter.emit("towed", payload);
}

export function onSessionEvent<K extends keyof SessionEventMap>(
  type: K,
  listener: (payload: SessionEventMap[K]) => void,
): () => void {
  emitter.on(type, listener);
  return () => emitter.off(type, listener);
}