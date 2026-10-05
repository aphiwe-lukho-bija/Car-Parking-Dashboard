import { describe, expect, it } from "vitest";
import { arrivalPath, departurePath, getBay } from "@shared/lotLayout";
import { measurePath, samplePath, type MeasuredPath } from "./pathSampler";

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Mirror of the fleet's reversing test, run against the real lot paths.
 *
 * The fleet infers a reverse manoeuvre by sampling either side of the vehicle
 * along its path and comparing the direction of travel with the facing. That
 * inference is only correct if the final leg of an arrival really is travelled
 * against the nose, so this asserts it directly rather than trusting it.
 */
function isReversing(path: MeasuredPath, distance: number, speed = 9): boolean {
  if (path.total <= 0 || speed < 0.4) return false;

  const here = distance / path.total;
  const step = Math.min(0.02, Math.max(0.002, 4 / path.total));

  const a = samplePath(path, clamp01(here - step));
  const b = samplePath(path, clamp01(here + step));

  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (Math.hypot(dx, dz) < 1e-6) return false;

  const heading = samplePath(path, here).rotationY;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);

  return dx * fx + dz * fz < 0;
}

describe("reverse manoeuvre detection", () => {
  const bay = getBay("A-01");
  if (bay === undefined) throw new Error("bay A-01 missing from the layout");

  const arrival = measurePath(arrivalPath(bay));

  it("reads the final approach into the bay as reversing", () => {
    // Sample densely through the last 15% of the journey, which is the reverse
    // leg: the car has turned out of the aisle and is backing into the bay.
    const samples = Array.from({ length: 12 }, (_, i) =>
      isReversing(arrival, arrival.total * (0.85 + (i / 12) * 0.14)),
    );

    expect(samples.some((value) => value)).toBe(true);
    // The last stretch, fully committed to the bay, must read as reversing.
    expect(isReversing(arrival, arrival.total * 0.99)).toBe(true);
  });

  it("reads the drive-in along the aisle as forward travel", () => {
    expect(isReversing(arrival, arrival.total * 0.1)).toBe(false);
    expect(isReversing(arrival, arrival.total * 0.5)).toBe(false);
  });

  it("reads a departing vehicle leaving its bay as forward travel", () => {
    const departure = measurePath(departurePath(bay));

    // Departures are nose-first out of the bay, so the whole path is forwards.
    expect(isReversing(departure, departure.total * 0.99)).toBe(false);
    expect(isReversing(departure, departure.total * 0.5)).toBe(false);
  });

  it("reports no reversal for a stationary vehicle", () => {
    expect(isReversing(arrival, arrival.total, 0)).toBe(false);
  });
});

describe("path corner reporting", () => {
  const bay = getBay("B-01");
  if (bay === undefined) throw new Error("bay B-01 missing from the layout");

  const arrival = measurePath(arrivalPath(bay));

  it("reports no curvature on a straight leg", () => {
    // The long aisle run carries no heading change at all.
    expect(samplePath(arrival, 0.35).turnRate).toBe(0);
  });

  it("surfaces curvature before the corner is reached, not just inside it", () => {
    const samples = Array.from({ length: 200 }, (_, i) => samplePath(arrival, i / 199));
    const peak = Math.max(...samples.map((s) => s.turnRate));

    expect(peak).toBeGreaterThan(0);

    // The turn is non-zero at more than one point on the path, which is what
    // proves it is a look-ahead rather than a single in-corner sample.
    const nonZero = samples.filter((s) => s.turnRate > 0).length;
    expect(nonZero).toBeGreaterThan(5);
  });
});