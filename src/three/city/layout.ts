import * as THREE from "three";

/**
 * The plan of the neighbourhood, and the generator that fills it with buildings.
 *
 * North is -Z and east is +X, matching the lot. Heading north from the shop
 * terraces the order is rear lane, pavement, avenue, pavement, blocks; heading
 * east it is the boundary hedge, a planted strip, pavement, avenue, pavement,
 * blocks. Everything is derived once from a fixed seed so the town is identical
 * on every reload.
 */

/** North avenue: the east-west street between the shops and the first block. */
export const NA = {
  x0: -150,
  x1: 110,
  roadN: -59.5,
  roadS: -47.5,
  paveN: -61.5,
  paveS: -46,
};

/** East avenue: the north-south street behind the numbered shop row. */
export const EA = {
  z0: -59.5,
  z1: 61.5,
  roadW: 31.5,
  roadE: 43.5,
  paveW: 29.5,
  paveE: 45.5,
};

/** South avenue: the street between the lot and the blocks behind Zone D. */
export const SA = {
  x0: -150,
  x1: 110,
  roadN: 47.5,
  roadS: 59.5,
  paveN: 46,
  paveS: 61.5,
};

/** Service lane along the back of the shops, for stalls, bins and deliveries. */
export const LANE = { x0: -50, x1: 29.5, zN: -46, zS: -41.5 };

export const FLOOR_H = 3.4;

export type RoofKind = "tank" | "unit" | "stair" | "board" | "none";

export interface CityBlock {
  /** World centre of the mass. */
  x: number;
  z: number;
  /** Y rotation; 0 fronts +Z, PI fronts -Z, -PI/2 fronts -X, PI/2 fronts +X. */
  rot: number;
  width: number;
  depth: number;
  height: number;
  floors: number;
  wall: string;
  /** Ground floor is a lit shopfront rather than a window grid. */
  storefront: boolean;
  sign?: string;
  awning?: string;
  roof: RoofKind;
  billboard?: string;
}

/** mulberry32: tiny, seedable, and the same on every machine. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WALLS = [
  "#d8cfbf",
  "#c9b7a0",
  "#b98d6f",
  "#a85a44",
  "#93a1ac",
  "#cbb16a",
  "#a3ae9c",
  "#e4dccb",
  "#8c6f5a",
];

const FALLBACK_WALL = WALLS[0] ?? "#9aa0a6";

export const AWNINGS = ["#b8452f", "#2f6d5b", "#c9a44a", "#3f5f8a", "#8a3f6d", "#c47f2a"];

const SHOP_NAMES = [
  "CORNER CAFE",
  "CITY LAUNDRY",
  "GREEN GROCER",
  "NAIL BARBER",
  "MILK & HONEY",
  "CHEMIST",
  "HARDWARE",
  "TAKEAWAY",
  "BOOKSHOP",
  "PET STORE",
  "BOTTLE STORE",
  "SNEAKER LAB",
  "FISH & CHIPS",
  "THE BARBER",
  "DELI",
  "TAILOR",
  "CYCLE REPAIR",
  "FLOWER SHOP",
  "BAKERY",
  "VIDEO SHOP",
  "TATTOO",
  "SUSHI BAR",
  "PIZZA CORNER",
  "COMPUTER FIX",
];

const BILLBOARDS = ["APEX TOWERS", "CITY LOFTS", "THE QUARTER"];

interface RunSpec {
  axis: "x" | "z";
  from: number;
  to: number;
  /** World coordinate of the front elevation. */
  front: number;
  depth: number;
  floorsMin: number;
  floorsMax: number;
  seed: number;
  storefront?: boolean;
  /** Chance a slot is left empty, so the skyline is not a solid wall. */
  gap?: number;
  /** Block indices that carry a rooftop billboard. */
  boards?: number[];
  /**
   * Which way the mass grows away from its front. Defaults to -1 on axis x
   * (north runs, growing toward -Z) and +1 on axis z (east runs, growing
   * toward +X); south runs set +1 and the far-west closing block sets -1.
   */
  dir?: 1 | -1;
}

const RUNS: RunSpec[] = [
  // North of the avenue: the terrace the shops look across at.
  { axis: "x", from: -140, to: 110, front: -61.5, depth: 13, floorsMin: 2, floorsMax: 4, seed: 11, storefront: true },
  { axis: "x", from: -140, to: 110, front: -77.5, depth: 17, floorsMin: 5, floorsMax: 8, seed: 22, gap: 0.12, boards: [4, 11] },
  { axis: "x", from: -138, to: 108, front: -98.5, depth: 23, floorsMin: 7, floorsMax: 15, seed: 33, gap: 0.34, boards: [3] },
  // East of the avenue, behind shops 06-10.
  { axis: "z", from: -45.5, to: 50, front: 45.5, depth: 13, floorsMin: 2, floorsMax: 4, seed: 44, storefront: true },
  { axis: "z", from: -45.5, to: 55, front: 61.5, depth: 17, floorsMin: 5, floorsMax: 8, seed: 55, gap: 0.12, boards: [2, 6] },
  { axis: "z", from: -45.5, to: 60, front: 82, depth: 23, floorsMin: 7, floorsMax: 14, seed: 66, gap: 0.34 },
  // South of the avenue: the terraces that close the view past Zone D.
  { axis: "x", from: -140, to: 110, front: 61.5, depth: 13, floorsMin: 2, floorsMax: 4, seed: 77, storefront: true, dir: 1 },
  { axis: "x", from: -140, to: 110, front: 77.5, depth: 17, floorsMin: 5, floorsMax: 8, seed: 88, gap: 0.12, boards: [4, 9], dir: 1 },
  { axis: "x", from: -138, to: 108, front: 98.5, depth: 23, floorsMin: 7, floorsMax: 16, seed: 99, gap: 0.34, dir: 1 },
  // West of the access road, one on each side of the corridor.
  { axis: "x", from: -165, to: -51, front: -12, depth: 34, floorsMin: 4, floorsMax: 13, seed: 111, storefront: true, gap: 0.08 },
  { axis: "x", from: -165, to: -26, front: 13, depth: 33, floorsMin: 4, floorsMax: 14, seed: 133, storefront: true, gap: 0.08 },
  // Fillers that plug the skyline behind the mall and at the road's end.
  { axis: "x", from: -50, to: -25, front: -22, depth: 24, floorsMin: 5, floorsMax: 11, seed: 122, gap: 0.06 },
  { axis: "z", from: -14, to: 14, front: -172, depth: 16, floorsMin: 6, floorsMax: 12, seed: 144, dir: -1 },
];

/**
 * Walks a run of frontage, carving it into wall-to-wall blocks.
 *
 * A block's front face lies on the run's `front` line and the mass grows away
 * from the street: along -Z for the north runs (rot 0, facing the lot), along
 * +Z for the south runs (rot PI, facing the lot again), along +X for the east
 * runs (rot -PI/2) and along -X for the closing block west of the road.
 */
function buildRun(spec: RunSpec, shopName: number, board: number): CityBlock[] {
  const random = makeRandom(spec.seed);
  const blocks: CityBlock[] = [];
  const dir = spec.dir ?? (spec.axis === "x" ? -1 : 1);
  const rot =
    spec.axis === "x" ? (dir === -1 ? 0 : Math.PI) : dir === 1 ? -Math.PI / 2 : Math.PI / 2;
  let cursor = spec.from;
  let index = 0;
  let nameIndex = shopName;
  let boardIndex = board;

  while (cursor < spec.to - 5) {
    let width = 8 + random() * 8;
    if (cursor + width > spec.to) width = spec.to - cursor;
    const take = cursor + width / 2;
    cursor += width;

    if (spec.gap !== undefined && random() < spec.gap) {
      index += 1;
      continue;
    }

    const floors = Math.max(
      2,
      Math.min(16, Math.round(spec.floorsMin + random() * (spec.floorsMax - spec.floorsMin))),
    );
    const height = floors * FLOOR_H;

    const storefront = spec.storefront === true;
    const isBoard = spec.boards?.includes(index) === true;
    const roof: RoofKind = isBoard
      ? "board"
      : random() < 0.42
        ? random() < 0.5
          ? "tank"
          : "unit"
        : random() < 0.4
          ? "stair"
          : "none";

    const block: CityBlock = {
      x: spec.axis === "x" ? take : spec.front + (dir * spec.depth) / 2,
      z: spec.axis === "x" ? spec.front + (dir * spec.depth) / 2 : take,
      rot,
      width,
      depth: spec.depth,
      height,
      floors,
      wall: WALLS[Math.floor(random() * WALLS.length)] ?? FALLBACK_WALL,
      storefront,
      roof,
    };

    if (storefront) {
      block.sign = SHOP_NAMES[nameIndex % SHOP_NAMES.length];
      block.awning = AWNINGS[Math.floor(random() * AWNINGS.length)];
      nameIndex += 1;
    }
    if (isBoard) {
      block.billboard = BILLBOARDS[boardIndex % BILLBOARDS.length];
      boardIndex += 1;
    }

    blocks.push(block);
    index += 1;
  }

  return blocks;
}

/** All 150-odd blocks of the district, generated once. */
export function buildDistrict(): CityBlock[] {
  const blocks: CityBlock[] = [];
  let shopName = 0;
  let board = 0;
  for (const spec of RUNS) {
    const run = buildRun(spec, shopName, board);
    if (spec.storefront === true) shopName += run.length;
    board += spec.boards?.length ?? 0;
    blocks.push(...run);
  }
  return blocks;
}

const FORWARD = new THREE.Vector3(0, 0, 1);

/**
 * One window rectangle in world space, as a matrix ready for instancing.
 *
 * Local space puts the window just proud of the front (or back) elevation, so
 * a single rotation about Y places it correctly on either avenue frontage.
 */
function windowMatrix(
  block: CityBlock,
  localX: number,
  y: number,
  localZ: number,
  width: number,
  height: number,
): THREE.Matrix4 {
  const cos = Math.cos(block.rot);
  const sin = Math.sin(block.rot);
  const x = block.x + localX * cos + localZ * sin;
  const z = block.z - localX * sin + localZ * cos;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(FORWARD, block.rot),
    new THREE.Vector3(width, height, 0.16),
  );
}

export interface WindowGrid {
  lit: THREE.Matrix4[];
  dark: THREE.Matrix4[];
}

/**
 * The window grid for every block: warm lit panes against cool dark ones.
 *
 * The lit/dark split is what makes an apartment block read as inhabited at
 * golden hour, so it is decided per window from the same seed as the mass.
 */
export function buildWindows(blocks: CityBlock[]): WindowGrid {
  const lit: THREE.Matrix4[] = [];
  const dark: THREE.Matrix4[] = [];

  blocks.forEach((block, blockIndex) => {
    const random = makeRandom(9000 + blockIndex * 17);
    const usable = Math.max(3, block.width - 2);
    const columns = Math.max(2, Math.floor(usable / 2.9));
    const step = usable / columns;
    const paneWidth = Math.min(1.7, step - 0.9);
    const firstFloor = block.storefront ? 1 : 0;

    for (let floor = firstFloor; floor < block.floors; floor += 1) {
      const y = floor * FLOOR_H + FLOOR_H * 0.54;
      for (let column = 0; column < columns; column += 1) {
        const localX = -usable / 2 + step * (column + 0.5);
        const target = random() < 0.55 ? lit : dark;
        // Front elevation, then the rear one facing the block behind.
        target.push(windowMatrix(block, localX, y, block.depth / 2 + 0.05, paneWidth, 1.7));
        target.push(windowMatrix(block, localX, y, -block.depth / 2 - 0.05, paneWidth, 1.7));
      }
    }
  });

  return { lit, dark };
}

const UP = new THREE.Vector3(0, 1, 0);

export function boxMatrix(
  x: number,
  y: number,
  z: number,
  rot: number,
  width: number,
  height: number,
  depth: number,
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(UP, rot),
    new THREE.Vector3(width, height, depth),
  );
}
