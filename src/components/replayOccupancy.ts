import type { ParkingSpaceDto } from "@shared/types";

/**
 * Rewinds a bay list to the instant a replay frame describes.
 *
 * Extracted from the grid so the rule is testable on its own: the interesting
 * part is that a reservation is deliberately left untouched. A hold is not an
 * occupancy, so a reserved bay that nobody is sitting in stays reserved instead
 * of being shown free, which would suggest the operator can assign it.
 */
export function projectBaysForReplay(
  spaces: readonly ParkingSpaceDto[],
  replayBays: ReadonlySet<string> | null,
): ParkingSpaceDto[] {
  if (replayBays === null) return spaces as ParkingSpaceDto[];

  return spaces.map((space) => {
    const wasOccupied = replayBays.has(space.spaceNumber);

    // A reserved bay with nobody in it stays reserved, but a car genuinely
    // sitting in it outranks the hold and must read as occupied.
    if (space.status === "reserved" && !wasOccupied) return space;

    if (wasOccupied && space.status !== "occupied") {
      return { ...space, status: "occupied" as const };
    }

    if (!wasOccupied && space.status === "occupied") {
      return { ...space, status: "available" as const };
    }

    return space;
  });
}
