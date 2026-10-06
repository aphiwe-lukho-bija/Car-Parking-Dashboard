/**
 * Frame-rate shared state between the moving parts of the scene.
 *
 * The store is the right place for anything React needs to render, but it is
 * the wrong place for numbers that change sixty times a second: routing a tow
 * truck's position through state would re-render the whole dashboard per frame
 * just to move a mesh. This is the single mutable box those systems use to
 * hand each other facts — the camera director reads the tow subject, the boom
 * gate reads who is near the entrance, and nothing re-renders to carry them.
 */

export type TowPhase = "approach" | "hook" | "extract";

export interface TowSubject {
  active: boolean;
  phase: TowPhase;
  /** World position of the subject the camera should be framing. */
  x: number;
  z: number;
}

export const sceneBus = {
  /** Live position of the tow being staged, read by the camera director. */
  tow: { active: false, phase: "approach", x: 0, z: 0 } as TowSubject,

  /**
   * Nearest non-parked vehicle to the boom gate, published by the fleet.
   * `null` when the entrance is clear, which is what lets the arms drop.
   */
  gateTraffic: null as { x: number; z: number } | null,
};

/** Called by the fleet once per frame with the vehicle nearest the gate. */
export function publishGateTraffic(vehicle: { x: number; z: number } | null): void {
  sceneBus.gateTraffic = vehicle;
}
