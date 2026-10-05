import type { VehicleType } from "@shared/types";

/**
 * Physical proportions per vehicle class, in metres.
 *
 * Kept separate from the mesh component so the numbers can be reused by the
 * bay-sizing logic and asserted in tests without importing React.
 */
export interface VehicleDimensions {
  length: number;
  width: number;
  height: number;
  wheelRadius: number;
  cabinLength: number;
  cabinHeight: number;
  cabinOffsetZ: number;
}

export const VEHICLE_DIMENSIONS: Record<VehicleType, VehicleDimensions> = {
  car: {
    length: 4.42,
    width: 1.84,
    height: 1.46,
    wheelRadius: 0.33,
    cabinLength: 2.1,
    cabinHeight: 0.56,
    cabinOffsetZ: -0.18,
  },
  suv: {
    length: 4.72,
    width: 1.94,
    height: 1.74,
    wheelRadius: 0.37,
    cabinLength: 2.6,
    cabinHeight: 0.68,
    cabinOffsetZ: -0.1,
  },
  truck: {
    length: 5.9,
    width: 2.14,
    height: 2.42,
    wheelRadius: 0.44,
    cabinLength: 2.1,
    cabinHeight: 1.16,
    cabinOffsetZ: 1.55,
  },
  motorbike: {
    length: 2.1,
    width: 0.72,
    height: 1.22,
    wheelRadius: 0.32,
    cabinLength: 0.9,
    cabinHeight: 0.5,
    cabinOffsetZ: -0.1,
  },
};

/** A curated palette: dark neutrals with a handful of saturated accents. */
export const PAINT_COLOURS = [
  "#0d1117",
  "#f4f6f8",
  "#5b6570",
  "#1b2a4a",
  "#5c1a24",
  "#d4b483",
  "#2f4f43",
  "#8a9099",
  "#243447",
  "#7a2e3a",
] as const;

/**
 * Stable per-plate colour, so a vehicle keeps the same paint between visits
 * rather than being repainted each time it drives onto the lot.
 */
export function paintFor(plate: string): string {
  let hash = 0;
  for (let i = 0; i < plate.length; i += 1) {
    hash = (hash * 31 + plate.charCodeAt(i)) >>> 0;
  }
  return PAINT_COLOURS[hash % PAINT_COLOURS.length] ?? "#0d1117";
}