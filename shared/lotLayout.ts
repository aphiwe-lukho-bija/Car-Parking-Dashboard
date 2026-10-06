import type { VehicleType } from "./types";

/**
 * Single source of truth for the physical layout of the facility.
 *
 * The seeder writes these rows into MySQL and the 3D scene renders them, so a
 * bay can never exist in the database without a matching mesh, or vice versa.
 * All units are metres. The origin is the centre of the central aisle.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface VehiclePath {
  waypoints: Vec3[];
  /** Orientation to hold on each leg; one fewer entry than `waypoints`. */
  headings: number[];
}

export interface BayDimensions {
  width: number;
  depth: number;
}

export const BAY_DIMENSIONS: Record<VehicleType, BayDimensions> = {
  car: { width: 2.6, depth: 5.2 },
  suv: { width: 2.9, depth: 5.4 },
  truck: { width: 3.4, depth: 6.4 },
  motorbike: { width: 1.3, depth: 2.6 },
};

/** Width of the service lane running along each row of bays. */
export const AISLE_WIDTH = 6.8;
/** Width of the main drive-through aisle down the middle of the facility. */
export const CENTRAL_AISLE_WIDTH = 9.5;
/** Clearance of tarmac beyond the outermost row of bays. */
export const LOT_MARGIN = 6.5;

export type LotSide = -1 | 1;

export interface SectionSpec {
  code: string;
  /** -1 is the northern half, +1 the southern half. */
  side: LotSide;
  /** 0 is the row nearest the central aisle. */
  index: number;
  bays: number;
  type: VehicleType;
}

export const SECTION_SPECS: readonly SectionSpec[] = [
  { code: "A", side: -1, index: 0, bays: 12, type: "car" },
  { code: "C", side: -1, index: 1, bays: 14, type: "motorbike" },
  { code: "B", side: 1, index: 0, bays: 12, type: "suv" },
  { code: "D", side: 1, index: 1, bays: 8, type: "truck" },
] as const;

export interface BaySlot {
  spaceNumber: string;
  section: string;
  /** 1-based position within the section, as displayed to operators. */
  ordinal: number;
  type: VehicleType;
  position: Vec3;
  /** Centre of the service lane that feeds this bay. */
  laneZ: number;
  /** Y rotation that points a nose-in vehicle at the back of the bay. */
  rotationY: number;
  width: number;
  depth: number;
}

/** Cars are modelled facing +Z, so heading -Z needs a half turn. */
const FACING_NORTH = Math.PI;
const FACING_SOUTH = 0;

function buildSlots(): {
  bays: BaySlot[];
  halfWidth: number;
  halfDepth: number;
} {
  const bays: BaySlot[] = [];
  let maxAbsX = 0;
  let maxAbsZ = CENTRAL_AISLE_WIDTH / 2;

  for (const side of [-1, 1] as const) {
    const specs = SECTION_SPECS.filter((s) => s.side === side).sort(
      (a, b) => a.index - b.index,
    );

    // Walk outward from the edge of the central aisle, alternating a service
    // lane then a row of bays, so sections of differing depth still tile.
    let cursor = CENTRAL_AISLE_WIDTH / 2;

    for (const spec of specs) {
      const { width, depth } = BAY_DIMENSIONS[spec.type];

      const laneZ = side * (cursor + AISLE_WIDTH / 2);
      const bayZ = side * (cursor + AISLE_WIDTH + depth / 2);
      const rowWidth = spec.bays * width;
      const startX = -rowWidth / 2;

      for (let i = 0; i < spec.bays; i += 1) {
        const x = startX + i * width + width / 2;

        bays.push({
          spaceNumber: `${spec.code}-${String(i + 1).padStart(2, "0")}`,
          section: spec.code,
          ordinal: i + 1,
          type: spec.type,
          position: { x, y: 0, z: bayZ },
          laneZ,
          // Vehicles reverse into a bay, leaving their nose pointing at the
          // central aisle. That is both realistic for a retail lot and means a
          // single path serves both entry and exit — departure is just the
          // arrival path run backwards.
          rotationY: side === -1 ? FACING_SOUTH : FACING_NORTH,
          width,
          depth,
        });
      }

      cursor += AISLE_WIDTH + depth;
      maxAbsZ = Math.max(maxAbsZ, Math.abs(bayZ) + depth / 2);
      maxAbsX = Math.max(maxAbsX, rowWidth / 2);
    }
  }

  return { bays, halfWidth: maxAbsX, halfDepth: maxAbsZ };
}

const layout = buildSlots();

export const BAYS: readonly BaySlot[] = layout.bays;

export const LOT_HALF_WIDTH = layout.halfWidth;
export const LOT_HALF_DEPTH = layout.halfDepth;

/** West edge of the central aisle, where the boom gate stands. */
export const GATE_X = -(LOT_HALF_WIDTH + 3);

/**
 * Staging point out on the access road where arriving vehicles fade up.
 *
 * Far enough west that a car has driven a good stretch of open road at full
 * opacity before it reaches the gate — appearing next to the entrance would
 * read as a spawn point rather than a street.
 */
export const STAGING_X = GATE_X - 52;

/**
 * How far past staging a departing vehicle drives before it is removed.
 *
 * Far enough that the car leaves through the far edge of the visible scene
 * rather than disappearing while it is still on screen.
 */
export const EXIT_X = GATE_X - 96;

export const BAY_BY_NUMBER: ReadonlyMap<string, BaySlot> = new Map(
  BAYS.map((bay) => [bay.spaceNumber, bay]),
);

export function getBay(spaceNumber: string): BaySlot | undefined {
  return BAY_BY_NUMBER.get(spaceNumber);
}

/**
 * Orientation to hold while driving *forward* from the central aisle out along
 * the service lane toward a bay. This is the opposite way round to
 * `rotationY`, because the vehicle turns into the lane nose-first and then
 * reverses into the bay itself.
 */
export function laneHeading(bay: BaySlot): number {
  return bay.position.z < 0 ? FACING_NORTH : FACING_SOUTH;
}

/**
 * The route a vehicle follows from the staging area into its bay.
 *
 * Legs 1-3 are driven forward; the final leg is reversed into the bay, which is
 * why the last heading opposes the direction of travel. `headings[i]` is the
 * orientation to hold from `waypoints[i]` to `waypoints[i + 1]`, so the client
 * turns the car as it passes each waypoint instead of snapping angles.
 */
export function arrivalPath(bay: BaySlot): VehiclePath {
  return {
    waypoints: [
      { x: STAGING_X, y: 0, z: 0 },
      { x: GATE_X, y: 0, z: 0 },
      { x: bay.position.x, y: 0, z: 0 },
      { x: bay.position.x, y: 0, z: bay.laneZ },
      { x: bay.position.x, y: 0, z: bay.position.z },
    ],
    headings: [
      Math.PI / 2, // staging -> gate, heading east
      Math.PI / 2, // gate -> down the central aisle
      laneHeading(bay), // aisle -> service lane, nose toward the bays
      bay.rotationY, // reversing into the bay, nose back at the aisle
    ],
  };
}

/**
 * Leaving is the mirror of arrival. Because vehicles reverse in, the nose
 * already faces the aisle, so pulling out is a straight nose-first drive — no
 * three-point turn needed.
 */
export function departurePath(bay: BaySlot): VehiclePath {
  const incoming = arrivalPath(bay);

  return {
    // Reversed, then extended well past the staging point. The vehicle is only
    // culled once it is far outside the lot, so it visibly drives off into the
    // distance instead of blinking out of existence while still in frame.
    waypoints: [
      { x: incoming.waypoints[4]?.x ?? bay.position.x, y: 0, z: bay.position.z },
      ...[...incoming.waypoints].reverse().slice(1),
      { x: EXIT_X, y: 0, z: 0 },
    ],
    headings: [
      bay.rotationY, // bay -> service lane
      bay.rotationY, // service lane -> central aisle
      -Math.PI / 2, // down the aisle and out through the gate, heading west
      -Math.PI / 2, // gate -> staging
      -Math.PI / 2, // staging -> out of sight
    ],
  };
}