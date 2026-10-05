import { describe, expect, it } from "vitest";
import type { ParkingSpaceDto } from "@shared/types";
import { projectBaysForReplay } from "./replayOccupancy";

function space(overrides: Partial<ParkingSpaceDto> = {}): ParkingSpaceDto {
  return {
    id: 1,
    spaceNumber: "A-01",
    section: "A",
    type: "car",
    status: "available",
    session: null,
    ...overrides,
  } as ParkingSpaceDto;
}

describe("projectBaysForReplay", () => {
  it("returns the same list untouched when no replay is running", () => {
    const spaces = [space(), space({ id: 2, status: "occupied" })];
    expect(projectBaysForReplay(spaces, null)).toBe(spaces);
  });

  it("fills a bay that was free now but was occupied then", () => {
    const result = projectBaysForReplay([space()], new Set(["A-01"]));
    expect(result[0]?.status).toBe("occupied");
  });

  it("empties a bay that is occupied now but was free then", () => {
    const result = projectBaysForReplay([space({ status: "occupied" })], new Set());
    expect(result[0]?.status).toBe("available");
  });

  it("leaves a reserved bay reserved even when nobody is in it", () => {
    // A hold is not an occupancy: showing it free would imply it is assignable.
    const result = projectBaysForReplay([space({ status: "reserved" })], new Set());
    expect(result[0]?.status).toBe("reserved");
  });

  it("does not mutate the input bays", () => {
    const original = space({ status: "occupied" });
    const result = projectBaysForReplay([original], new Set());
    expect(result[0]).not.toBe(original);
    expect(original.status).toBe("occupied");
  });

  it("marks a reserved bay as occupied if a car genuinely sat in it", () => {
    const result = projectBaysForReplay([space({ status: "reserved" })], new Set(["A-01"]));
    expect(result[0]?.status).toBe("occupied");
  });
});
