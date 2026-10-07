import { useEffect, useMemo, type ReactElement } from "react";
import * as THREE from "three";
import {
  buildDistrict,
  buildWindows,
  boxMatrix,
  FLOOR_H,
  type CityBlock,
} from "./layout";
import { useBoxKit, useStdMaterial } from "./boxKit";
import { Instances } from "./Instances";
import { labelTexture } from "../labelTexture";

/**
 * The blocks themselves: mass, windows, shopfronts and roof clutter.
 *
 * Everything that repeats — every wall, every fascia, every awning, every
 * water tank — is folded into a handful of instanced draws for the whole
 * town, even though the district now runs in four directions. Only the pieces
 * that carry their own picture (the shop name boards and the rooftop
 * billboards) stay as individual meshes, because they need one texture each.
 */

const ROOF_CAP = "#3a3f46";
const PLINTH_TINT = "#7d766a";
const GLASS_DARK = "#1c2833";
const GLASS_BAND = "#3a3222";
const BRONZE = "#c9a44a";
const METAL = "#39404a";
const ROOF_PLANT = "#6d737c";
const TANK = "#9aa3ad";

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

/** One box in a block's local frame, as a world matrix ready for instancing. */
function partMatrix(
  block: CityBlock,
  localX: number,
  y: number,
  localZ: number,
  width: number,
  height: number,
  depth: number,
  tilt = 0,
): THREE.Matrix4 {
  const cos = Math.cos(block.rot);
  const sin = Math.sin(block.rot);
  const x = block.x + localX * cos + localZ * sin;
  const z = block.z - localX * sin + localZ * cos;
  const rotation = new THREE.Quaternion().setFromAxisAngle(UP, block.rot);
  if (tilt !== 0) rotation.multiply(new THREE.Quaternion().setFromAxisAngle(RIGHT, tilt));
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    rotation,
    new THREE.Vector3(width, height, depth),
  );
}

/** A point in a block's local frame, in world space. */
function localPoint(block: CityBlock, localX: number, y: number, localZ: number): [number, number, number] {
  const cos = Math.cos(block.rot);
  const sin = Math.sin(block.rot);
  return [block.x + localX * cos + localZ * sin, y, block.z - localX * sin + localZ * cos];
}

interface Batch {
  matrices: THREE.Matrix4[];
  colours: THREE.Color[];
}

function makeBatch(): Batch {
  return { matrices: [], colours: [] };
}

interface DistrictDetail {
  storeGlass: THREE.Matrix4[];
  plinthGlass: THREE.Matrix4[];
  trim: Batch;
  awning: Batch;
  roofBox: Batch;
  roofTank: Batch;
}

/**
 * One pass over every block collects the pieces of its frontage into shared
 * batches: shop glazing, the bronze-and-metal trim, the awnings, and the roof
 * clutter. A hundred and fifty blocks collapse into five instanced draws.
 */
function buildDetail(blocks: CityBlock[]): DistrictDetail {
  const storeGlass: THREE.Matrix4[] = [];
  const plinthGlass: THREE.Matrix4[] = [];
  const trim = makeBatch();
  const awning = makeBatch();
  const roofBox = makeBatch();
  const roofTank = makeBatch();

  const add = (
    batch: Batch,
    block: CityBlock,
    localX: number,
    y: number,
    localZ: number,
    width: number,
    height: number,
    depth: number,
    colour: string,
    tilt = 0,
  ): void => {
    batch.matrices.push(partMatrix(block, localX, y, localZ, width, height, depth, tilt));
    batch.colours.push(new THREE.Color(colour));
  };

  blocks.forEach((block) => {
    const front = block.depth / 2;
    const width = block.width;

    if (block.storefront) {
      storeGlass.push(partMatrix(block, 0, 1.85, front + 0.06, width - 1.4, 2.7, 0.14));
      add(trim, block, 0, FLOOR_H - 0.5, front + 0.14, width - 0.7, 0.95, 0.2, BRONZE);
      for (const side of [-1, 0, 1]) {
        add(trim, block, side * (width / 2 - 0.5), 1.85, front + 0.12, 0.14, 2.9, 0.24, METAL);
      }
      if (block.awning !== undefined) {
        add(awning, block, 0, 2.85, front + 1, width - 1.8, 0.14, 2, block.awning, 0.24);
        add(awning, block, 0, 2.69, front + 1.96, width - 1.8, 0.34, 0.12, block.awning, 0.24);
      }
      for (const side of [-1, 1]) {
        add(
          trim,
          block,
          side * (width / 2 - 0.1),
          FLOOR_H / 2,
          front + 0.08,
          0.28,
          FLOOR_H,
          0.28,
          BRONZE,
        );
      }
    } else {
      plinthGlass.push(partMatrix(block, 0, 1.9, front + 0.05, width - 1.6, 2.4, 0.12));
      add(trim, block, 0, FLOOR_H - 0.35, front + 0.1, width - 0.9, 0.6, 0.16, ROOF_PLANT);
    }

    const roofY = block.height + 0.5;
    if (block.roof === "tank") {
      add(roofBox, block, -width * 0.2, roofY + 0.75, -1, 3, 1.5, 3, ROOF_PLANT);
      add(roofTank, block, -width * 0.2, roofY + 2.4, -1, 1, 1, 1, TANK);
    } else if (block.roof === "unit") {
      add(roofBox, block, width * 0.18, roofY + 0.55, -1.5, 3.4, 1.1, 2.2, "#8d949c");
      add(roofBox, block, -width * 0.22, roofY + 0.4, -2.4, 2.2, 0.8, 1.6, "#767d86");
    } else if (block.roof === "stair") {
      add(roofBox, block, width * 0.24, roofY + 1.3, -2.2, 3.6, 2.6, 3.2, "#c4bcac");
      add(roofBox, block, width * 0.24, roofY + 1.1, -0.55, 1.1, 2, 0.12, "#3c3730");
    } else if (block.roof === "board") {
      add(roofBox, block, 0, roofY + 2.1, front - 0.6, width * 0.72, 3, 0.35, "#2b3138");
      for (const side of [-1, 1]) {
        add(roofBox, block, side * width * 0.26, roofY + 1, -1.6, 0.3, 2, 0.3, ROOF_PLANT);
      }
    }
  });

  return { storeGlass, plinthGlass, trim, awning, roofBox, roofTank };
}

export function Buildings(): ReactElement {
  const blocks = useMemo(() => buildDistrict(), []);
  const windows = useMemo(() => buildWindows(blocks), [blocks]);
  const detail = useMemo(() => buildDetail(blocks), [blocks]);

  const mass = useBoxKit("#ffffff", { roughness: 0.86, metalness: 0.04 });
  const cap = useBoxKit(ROOF_CAP, { roughness: 0.8, metalness: 0.1 });
  const slab = useBoxKit(PLINTH_TINT, { roughness: 0.9 });

  const trimMaterial = useStdMaterial("#ffffff", { roughness: 0.45, metalness: 0.6 });
  const awningMaterial = useStdMaterial("#ffffff", { roughness: 0.75, metalness: 0.02 });
  const roofMaterial = useStdMaterial("#ffffff", { roughness: 0.7, metalness: 0.3 });
  const storeGlassMaterial = useStdMaterial(GLASS_BAND, {
    roughness: 0.14,
    metalness: 0.45,
    emissive: "#5c4520",
    emissiveIntensity: 0.75,
  });
  const plinthGlassMaterial = useStdMaterial(GLASS_DARK, {
    roughness: 0.16,
    metalness: 0.55,
    emissive: GLASS_BAND,
    emissiveIntensity: 0.35,
  });

  const tankGeometry = useMemo(() => new THREE.CylinderGeometry(1.15, 1.15, 1.9, 14), []);

  const litGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const litMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#4a4030",
        emissive: "#ffca8a",
        emissiveIntensity: 1.1,
        roughness: 0.35,
        metalness: 0.1,
      }),
    [],
  );
  const darkMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: GLASS_DARK,
        roughness: 0.18,
        metalness: 0.6,
      }),
    [],
  );
  useEffect(
    () => () => {
      tankGeometry.dispose();
      litGeometry.dispose();
      litMaterial.dispose();
      darkMaterial.dispose();
    },
    [tankGeometry, litGeometry, litMaterial, darkMaterial],
  );

  // One pass builds every wall, parapet and foundation slab in the district.
  const { massMatrices, wallColours, capMatrices, plinthMatrices } = useMemo(() => {
    const massMatrices: THREE.Matrix4[] = [];
    const wallColours: THREE.Color[] = [];
    const capMatrices: THREE.Matrix4[] = [];
    const plinthMatrices: THREE.Matrix4[] = [];

    blocks.forEach((block) => {
      massMatrices.push(
        boxMatrix(block.x, block.height / 2, block.z, block.rot, block.width, block.height, block.depth),
      );
      wallColours.push(new THREE.Color(block.wall));
      capMatrices.push(
        boxMatrix(
          block.x,
          block.height + 0.25,
          block.z,
          block.rot,
          block.width + 0.5,
          0.5,
          block.depth + 0.5,
        ),
      );
      plinthMatrices.push(
        boxMatrix(block.x, 0.15, block.z, block.rot, block.width + 0.35, 0.3, block.depth + 0.35),
      );
    });

    return { massMatrices, wallColours, capMatrices, plinthMatrices };
  }, [blocks]);

  return (
    <group>
      <Instances
        matrices={massMatrices}
        colours={wallColours}
        geometry={mass.geometry}
        material={mass.material}
        castShadow
        receiveShadow
      />
      <Instances
        matrices={capMatrices}
        geometry={cap.geometry}
        material={cap.material}
        castShadow
      />
      <Instances
        matrices={plinthMatrices}
        geometry={slab.geometry}
        material={slab.material}
        receiveShadow
      />
      <Instances matrices={windows.lit} geometry={litGeometry} material={litMaterial} />
      <Instances matrices={windows.dark} geometry={litGeometry} material={darkMaterial} />

      <Instances
        matrices={detail.storeGlass}
        geometry={mass.geometry}
        material={storeGlassMaterial}
      />
      <Instances
        matrices={detail.plinthGlass}
        geometry={mass.geometry}
        material={plinthGlassMaterial}
      />
      <Instances
        matrices={detail.trim.matrices}
        colours={detail.trim.colours}
        geometry={mass.geometry}
        material={trimMaterial}
        castShadow
      />
      <Instances
        matrices={detail.awning.matrices}
        colours={detail.awning.colours}
        geometry={mass.geometry}
        material={awningMaterial}
        castShadow
      />
      <Instances
        matrices={detail.roofBox.matrices}
        colours={detail.roofBox.colours}
        geometry={mass.geometry}
        material={roofMaterial}
        castShadow
      />
      <Instances
        matrices={detail.roofTank.matrices}
        colours={detail.roofTank.colours}
        geometry={tankGeometry}
        material={roofMaterial}
        castShadow
      />

      {/* The boards that carry their own picture: shop names and billboards. */}
      {blocks.map((block, index) => {
        if (block.storefront) {
          const sign = labelTexture(block.sign ?? "", "#f6ead0");
          return (
            <mesh
              key={`sign-${index}`}
              position={localPoint(block, 0, FLOOR_H - 0.5, block.depth / 2 + 0.26)}
              rotation={[0, block.rot, 0]}
            >
              <planeGeometry args={[Math.max(2.2, block.width - 2), 0.7]} />
              <meshBasicMaterial map={sign} transparent toneMapped={false} />
            </mesh>
          );
        }
        if (block.billboard === undefined) return null;
        const board = labelTexture(block.billboard, "#f6ead0");
        return (
          <mesh
            key={`board-${index}`}
            position={localPoint(block, 0, block.height + 2.6, block.depth / 2 - 0.38)}
            rotation={[0, block.rot, 0]}
          >
            <planeGeometry args={[block.width * 0.66, 2.5]} />
            <meshBasicMaterial map={board} transparent toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}
