import { describe, expect, it } from "vitest";
import {
  AISLE_WIDTH,
  BAYS,
  CENTRAL_AISLE_WIDTH,
  GATE_X,
  STAGING_X,
  SECTION_SPECS,
  arrivalPath,
  departurePath,
  getBay,
  laneHeading,
} from "./lotLayout";
import { measurePath, samplePath } from "../src/three/pathSampler";

const EXPECTED_TOTAL_BAYS = SECTION_SPECS.reduce((sum, spec) => sum + spec.bays, 0);

describe("lot layout", () => {
  it("produces every bay declared by the sections", () => {
    expect(BAYS).toHaveLength(EXPECTED_TOTAL_BAYS);
  });

  it("numbers bays uniquely and in section order", () => {
    expect(new Set(BAYS.map((bay) => bay.spaceNumber)).size).toBe(BAYS.length);
    expect(BAYS[0]?.spaceNumber).toBe("A-01");
    expect(BAYS.at(-1)?.spaceNumber).toBe("D-08");
  });

  it("keeps bays clear of the central aisle", () => {
    for (const bay of BAYS) {
      const distanceFromCentre = Math.abs(bay.position.z);
      expect(distanceFromCentre).toBeGreaterThan(CENTRAL_AISLE_WIDTH / 2);
      // The bay must sit beyond its own service lane, not inside it.
      expect(distanceFromCentre).toBeGreaterThan(Math.abs(bay.laneZ));
    }
  });

  it("never overlaps bays that share a section", () => {
    for (const section of new Set(BAYS.map((bay) => bay.section))) {
      const row = BAYS.filter((bay) => bay.section === section).sort(
        (a, b) => a.position.x - b.position.x,
      );

      for (let i = 1; i < row.length; i += 1) {
        const previous = row[i - 1];
        const current = row[i];
        if (previous === undefined || current === undefined) continue;

        expect(current.position.x - previous.position.x).toBeCloseTo(
          current.width,
          5,
        );
      }
    }
  });

  it("parks vehicles nose-out toward the central aisle", () => {
    for (const bay of BAYS) {
      // Facing +Z when on the north half, and -Z when on the south half, always
      // points back at the aisle so the drive-out needs no manoeuvre.
      const northSide = bay.position.z < 0;
      expect(bay.rotationY === 0).toBe(northSide);
      expect(laneHeading(bay) === Math.PI).toBe(northSide);
    }
  });

  it("puts the gate and staging area west of every bay", () => {
    expect(GATE_X).toBeLessThan(0);
    expect(STAGING_X).toBeLessThan(GATE_X);
    for (const bay of BAYS) {
      expect(bay.position.x).toBeGreaterThan(GATE_X);
    }
  });
});

describe("vehicle paths", () => {
  it("starts at staging, passes the gate, and ends in the bay", () => {
    const bay = getBay("A-01");
    expect(bay).toBeDefined();
    if (bay === undefined) return;

    const path = arrivalPath(bay);
    expect(path.waypoints[0]?.x).toBe(STAGING_X);
    expect(path.waypoints[1]?.x).toBe(GATE_X);
    expect(path.waypoints.at(-1)).toEqual(bay.position);
    expect(path.headings).toHaveLength(path.waypoints.length - 1);
  });

  it("runs the departure route back along the arrival route", () => {
    const bay = getBay("B-04");
    if (bay === undefined) throw new Error("bay B-04 is missing");

    const arrival = arrivalPath(bay);
    const departure = departurePath(bay);

    // Departure retraces arrival from the bay end, back through the gate.
    expect(departure.waypoints[0]).toEqual(arrival.waypoints.at(-1));
    expect(departure.waypoints.at(-2)).toEqual(arrival.waypoints[0]);
  });

  it("drives on past the gate so a leaving car never vanishes in view", () => {
    const bay = getBay("A-01");
    if (bay === undefined) throw new Error("bay A-01 is missing");

    const arrival = arrivalPath(bay);
    const departure = departurePath(bay);

    const last = departure.waypoints.at(-1);
    const arrivalStart = arrival.waypoints[0];

    // The exit runs well beyond where the arrival path begins, which is what
    // lets the vehicle leave the scene instead of being culled on screen.
    expect(last?.x).toBeLessThan((arrivalStart?.x ?? 0) - 30);
    expect(measurePath(departure).total).toBeGreaterThan(measurePath(arrival).total);
  });

  it("keeps a single heading for every leg of either route", () => {
    const bay = getBay("C-01");
    if (bay === undefined) throw new Error("bay C-01 is missing");

    for (const path of [arrivalPath(bay), departurePath(bay)]) {
      expect(path.headings).toHaveLength(path.waypoints.length - 1);
    }
  });

  it("points both arrival and departure noses down the correct axis", () => {
    const north = getBay("A-01");
    const south = getBay("B-01");
    if (north === undefined || south === undefined) {
      throw new Error("seed bays are missing");
    }

    // Reversing into a northern bay and reversing into a southern bay are
    // mirrored, and both leave the site heading west through the same gate.
    expect(arrivalPath(north).headings.at(-1)).toBe(0);
    expect(arrivalPath(south).headings.at(-1)).toBe(Math.PI);

    for (const bay of [north, south]) {
      const exit = departurePath(bay).headings.slice(2);
      expect(exit.every((heading) => heading === -Math.PI / 2)).toBe(true);
    }
  });
});

describe("path sampling", () => {
  it("interpolates linearly along a leg", () => {
    const bay = getBay("A-01");
    if (bay === undefined) throw new Error("bay A-01 is missing");

    const path = measurePath(arrivalPath(bay));
    expect(samplePath(path, 0).x).toBeCloseTo(STAGING_X, 5);
    expect(samplePath(path, 1).z).toBeCloseTo(bay.position.z, 5);

    // Midpoint of the very first leg.
    const half = samplePath(path, 0.1);
    expect(half.z).toBeCloseTo(0, 5);
    expect(half.x).toBeGreaterThan(STAGING_X);
  });

  it("clamps t outside the unit range instead of overshooting", () => {
    const bay = getBay("A-01");
    if (bay === undefined) throw new Error("bay A-01 is missing");

    const path = measurePath(arrivalPath(bay));
    expect(samplePath(path, -3)).toEqual(samplePath(path, 0));
    expect(samplePath(path, 9)).toEqual(samplePath(path, 1));
  });

  it("measures non-zero length for every bay", () => {
    for (const bay of BAYS) {
      const total = measurePath(arrivalPath(bay)).total;
      // Longest leg is the run along the central aisle.
      expect(total).toBeGreaterThan(LOT_HALF_SPAN);
      expect(total).toBeGreaterThan(AISLE_WIDTH);
    }
  });
});

const LOT_HALF_SPAN = 20;