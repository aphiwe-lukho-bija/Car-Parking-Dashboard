import type { VehiclePath, Vec3 } from "@shared/lotLayout";

export interface PathSample extends Vec3 {
  rotationY: number;
  /**
   * Magnitude of the heading change in progress at this point, in radians.
   * The fleet uses it to slow a vehicle into a corner, which is what makes the
   * approach look driven rather than railed.
   */
  turnRate: number;
}

export interface MeasuredPath {
  waypoints: Vec3[];
  headings: number[];
  /** Cumulative distance at the start of each segment. */
  offsets: number[];
  total: number;
}

/** Precomputes segment lengths so sampling is O(1) per frame. */
export function measurePath(path: VehiclePath): MeasuredPath {
  const offsets: number[] = [0];
  let total = 0;

  for (let i = 1; i < path.waypoints.length; i += 1) {
    const previous = path.waypoints[i - 1];
    const current = path.waypoints[i];
    if (previous === undefined || current === undefined) continue;

    total += Math.hypot(current.x - previous.x, current.z - previous.z);
    offsets.push(total);
  }

  return { waypoints: path.waypoints, headings: path.headings, offsets, total };
}

/**
 * Samples a path at `t` in [0, 1].
 *
 * Orientation is held constant for the whole of a leg and interpolated across
 * the corner between two legs, which reads as a vehicle turning rather than
 * pivoting on the spot.
 */
export function samplePath(path: MeasuredPath, t: number): PathSample {
  const { waypoints, headings, offsets, total } = path;

  if (total <= 0 || waypoints.length < 2) {
    const only = waypoints[0] ?? { x: 0, y: 0, z: 0 };
    return { ...only, rotationY: headings[0] ?? 0, turnRate: 0 };
  }

  const clamped = Math.min(1, Math.max(0, t));
  const distance = clamped * total;

  let leg = 0;
  while (leg < offsets.length - 1 && (offsets[leg + 1] ?? 0) < distance) {
    leg += 1;
  }

  const legStart = offsets[leg] ?? 0;
  const legEnd = offsets[leg + 1] ?? total;
  const legLength = legEnd - legStart;

  const from = waypoints[leg];
  const to = waypoints[leg + 1];
  if (from === undefined || to === undefined) {
    return {
      ...(from ?? { x: 0, y: 0, z: 0 }),
      rotationY: headings[leg] ?? 0,
      turnRate: 0,
    };
  }

  const legProgress = legLength <= 0 ? 1 : (distance - legStart) / legLength;
  const eased = Math.min(1, Math.max(0, legProgress));

  // Ease within the leg so vehicles accelerate out of a corner and settle into
  // the bay rather than moving at a constant robotic crawl.
  const smoothed = eased * eased * (3 - 2 * eased);

  const heading = headings[leg] ?? 0;
  const nextHeading = headings[leg + 1];

  let rotationY = heading;
  // Shortest-arc interpolation between the two legs' headings.
  let arc = 0;
  if (nextHeading !== undefined) {
    arc = nextHeading - heading;
    while (arc > Math.PI) arc -= Math.PI * 2;
    while (arc < -Math.PI) arc += Math.PI * 2;
    rotationY = heading + arc * Math.min(1, eased * 3);
  }

  // Curvature the driver has to deal with, including the turn still ahead of
  // them. Without the look-ahead term a vehicle could only react once it was
  // already mid-corner, which reads as braking late.
  const turnAhead = Math.abs(arc) * (1 - eased) ** 2;
  const turnNow = Math.abs(rotationY - heading);

  return {
    x: from.x + (to.x - from.x) * smoothed,
    y: 0,
    z: from.z + (to.z - from.z) * smoothed,
    rotationY,
    /** Heading change to negotiate, used to slow vehicles into corners. */
    turnRate: Math.max(turnNow, turnAhead),
  };
}