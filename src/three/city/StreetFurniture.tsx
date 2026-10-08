import { useEffect, useMemo, type ReactElement } from "react";
import * as THREE from "three";
import { EA, LANE, LANE_BAY, LANE_FOOT, NA, SA } from "./layout";
import { Instances } from "./Instances";

/**
 * Street furniture: the trees, lights, seats and stalls that turn a set of
 * roads into somewhere people use.
 *
 * Trees are instanced because there are sixty of them and three meshes each;
 * everything else is drawn plainly, because there are only a handful and the
 * variety in how they are placed is worth more than the draw calls saved.
 */

const TRUNK = "#5b4632";
const LEAF = "#3d5c37";
const LEAF_LIGHT = "#4a7040";
const METAL = "#39404a";
const DARK_METAL = "#2f353d";

/** Where the lamp standards stand, so trees keep clear of their bases. */
const NA_LIGHT_X = [-125, -65, -5, 55, 105];
const NA_SOUTH_LIGHT_X = [-100, -40, 20, 80];
const EA_LIGHT_Z = [-35, 5, 45];
const EA_WEST_LIGHT_Z = [-30, 30];
const SA_LIGHT_X = [-115, -55, 5, 65];
const SA_SOUTH_LIGHT_X = [-90, -30, 30, 90];

/** Bands across the rear street, so each kind of furniture keeps its own: the
 *  market row fills the narrow west bay, while the promenade behind the shops
 *  takes lamps at the kerb, bins and seats beside them, and a tree line
 *  against the fence. */
const LANE_MARKET_Z = (LANE.zS + LANE_BAY.z1) / 2;
const LANE_LIGHT_Z = LANE.zS + 0.6;
const LANE_EDGE_Z = LANE.zS + 1.1;
const LANE_TREE_Z = LANE_FOOT.z1 - 0.6;

function clearOf(x: number, lights: number[], margin = 7): boolean {
  return lights.every((light) => Math.abs(light - x) > margin);
}

/** A street tree: trunk plus two stacked canopies, instanced as three sets. */
function StreetTrees(): ReactElement {
  const positions = useMemo(() => {
    const list: { x: number; z: number; scale: number }[] = [];
    const random = (() => {
      let state = 4711;
      return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();

    // North pavement of the avenue, then the lot-side pavement.
    for (let x = NA.x0 + 15; x < NA.x1 - 8; x += 19) {
      const px = x + random() * 3;
      if (!clearOf(px, NA_LIGHT_X)) continue;
      if (px > EA.roadW - 4 && px < EA.roadE + 4) continue;
      list.push({ x: px, z: NA.roadN - 1.1, scale: 0.9 + random() * 0.35 });
    }
    for (let x = NA.x0 + 8; x < NA.x1 - 8; x += 19) {
      const px = x + random() * 3;
      if (!clearOf(px, NA_SOUTH_LIGHT_X)) continue;
      if (px > EA.roadW - 4 && px < EA.roadE + 4) continue;
      list.push({ x: px, z: NA.paveS - 0.75, scale: 0.85 + random() * 0.3 });
    }
    // East avenue, both pavements.
    for (let z = NA.paveS + 8; z < EA.z1 - 5; z += 17) {
      const pz = z + random() * 3;
      if (clearOf(pz, EA_LIGHT_Z)) {
        list.push({ x: EA.roadE + 1.2, z: pz, scale: 0.9 + random() * 0.35 });
      }
      const pw = z + 7 + random() * 3;
      if (clearOf(pw, EA_WEST_LIGHT_Z)) {
        list.push({ x: EA.paveW + 0.8, z: pw, scale: 0.85 + random() * 0.3 });
      }
    }
    // South avenue, both pavements.
    for (let x = SA.x0 + 12; x < SA.x1 - 8; x += 19) {
      const px = x + random() * 3;
      if (!clearOf(px, SA_LIGHT_X)) continue;
      if (px > EA.roadW - 4 && px < EA.roadE + 4) continue;
      list.push({ x: px, z: SA.roadN - 1.1, scale: 0.9 + random() * 0.35 });
    }
    for (let x = SA.x0 + 8; x < SA.x1 - 8; x += 19) {
      const px = x + random() * 3;
      if (!clearOf(px, SA_SOUTH_LIGHT_X)) continue;
      if (px > EA.roadW - 4 && px < EA.roadE + 4) continue;
      list.push({ x: px, z: SA.paveS - 0.75, scale: 0.85 + random() * 0.3 });
    }
    // The verge between the lot's fence and the south avenue.
    for (let x = -20; x <= 20; x += 10) {
      list.push({ x, z: 41.6, scale: 0.95 + random() * 0.3 });
    }
    // Both pavements of the access road, running out toward the west bands.
    for (const x of [-55, -81, -107, -133, -159]) {
      list.push({ x, z: -9.9, scale: 0.85 + random() * 0.3 });
      list.push({ x, z: 9.9, scale: 0.9 + random() * 0.35 });
    }
    // The promenade along the rear service road, a row against the fence.
    for (const x of [-21, -12, -3, 6, 15, 24]) {
      list.push({ x, z: LANE_TREE_Z, scale: 0.9 + random() * 0.35 });
    }
    return list;
  }, []);

  const trunk = useMemo(() => {
    const geometry = new THREE.CylinderGeometry(0.11, 0.17, 2.3, 8);
    geometry.translate(0, 1.15, 0);
    return geometry;
  }, []);
  const lower = useMemo(() => {
    const geometry = new THREE.IcosahedronGeometry(1.15, 1);
    geometry.translate(0, 2.6, 0);
    return geometry;
  }, []);
  const upper = useMemo(() => {
    const geometry = new THREE.IcosahedronGeometry(0.82, 1);
    geometry.translate(0.25, 3.35, 0.15);
    return geometry;
  }, []);
  const bark = useMemo(() => new THREE.MeshStandardMaterial({ color: TRUNK, roughness: 0.95 }), []);
  const canopy = useMemo(
    () => new THREE.MeshStandardMaterial({ color: LEAF, roughness: 1, flatShading: true }),
    [],
  );
  const canopyLight = useMemo(
    () => new THREE.MeshStandardMaterial({ color: LEAF_LIGHT, roughness: 1, flatShading: true }),
    [],
  );
  useEffect(
    () => () => {
      trunk.dispose();
      lower.dispose();
      upper.dispose();
      bark.dispose();
      canopy.dispose();
      canopyLight.dispose();
    },
    [trunk, lower, upper, bark, canopy, canopyLight],
  );

  const matrices = useMemo(
    () =>
      positions.map((tree) =>
        new THREE.Matrix4().compose(
          new THREE.Vector3(tree.x, 0, tree.z),
          new THREE.Quaternion(),
          new THREE.Vector3(tree.scale, tree.scale, tree.scale),
        ),
      ),
    [positions],
  );

  return (
    <group>
      <Instances matrices={matrices} geometry={trunk} material={bark} castShadow />
      <Instances matrices={matrices} geometry={lower} material={canopy} castShadow />
      <Instances matrices={matrices} geometry={upper} material={canopyLight} castShadow />
    </group>
  );
}

/** Lamp standard with its arm reaching out over the carriageway. */
function StreetLight({
  x,
  z,
  rotY,
}: {
  x: number;
  z: number;
  rotY: number;
}): ReactElement {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh castShadow position={[0, 3.6, 0]}>
        <cylinderGeometry args={[0.1, 0.16, 7.2, 10]} />
        <meshStandardMaterial color="#6a707a" roughness={0.55} metalness={0.65} />
      </mesh>
      <mesh castShadow position={[0, 7.05, 1.25]} rotation={[0.22, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 2.6, 8]} />
        <meshStandardMaterial color="#6a707a" roughness={0.55} metalness={0.65} />
      </mesh>
      <mesh position={[0, 6.7, 2.3]}>
        <boxGeometry args={[0.3, 0.16, 0.72]} />
        <meshStandardMaterial color="#cfd4dc" roughness={0.3} metalness={0.4} />
      </mesh>
    </group>
  );
}

/** Slatted bench on a pavement, facing the street. */
function Bench({
  x,
  z,
  rotY,
}: {
  x: number;
  z: number;
  rotY: number;
}): ReactElement {
  return (
    <group position={[x, 0.17, z]} rotation={[0, rotY, 0]}>
      <mesh castShadow position={[0, 0.42, -0.16]}>
        <boxGeometry args={[1.7, 0.08, 0.42]} />
        <meshStandardMaterial color="#6d5334" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 0.68, -0.32]} rotation={[0.18, 0, 0]}>
        <boxGeometry args={[1.7, 0.36, 0.07]} />
        <meshStandardMaterial color="#6d5334" roughness={0.8} />
      </mesh>
      {[-0.62, 0.62].map((side) => (
        <mesh key={side} castShadow position={[side, 0.2, -0.16]}>
          <boxGeometry args={[0.08, 0.4, 0.4]} />
          <meshStandardMaterial color={METAL} roughness={0.5} metalness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** Litter bin: body plus a domed lid. */
function Bin({ x, z }: { x: number; z: number }): ReactElement {
  return (
    <group position={[x, 0.17, z]}>
      <mesh castShadow position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.3, 0.26, 0.9, 12]} />
        <meshStandardMaterial color="#3d4a42" roughness={0.7} metalness={0.3} />
      </mesh>
      <mesh castShadow position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.34, 0.3, 0.14, 12]} />
        <meshStandardMaterial color={METAL} roughness={0.5} metalness={0.6} />
      </mesh>
    </group>
  );
}

/** Three-aspect signal on a pole, facing traffic approaching from the south. */
function TrafficSignal({ x, z }: { x: number; z: number }): ReactElement {
  const aspects: [string, number][] = [
    ["#ff3b30", 0.55],
    ["#ffb300", 0.12],
    ["#2fd36b", 0.1],
  ];

  return (
    <group position={[x, 0.17, z]}>
      <mesh castShadow position={[0, 2.6, 0]}>
        <boxGeometry args={[0.22, 5.2, 0.22]} />
        <meshStandardMaterial color={DARK_METAL} roughness={0.55} metalness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 5.4, 0.7]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.18, 0.18, 1.5]} />
        <meshStandardMaterial color={DARK_METAL} roughness={0.55} metalness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 4.4, 1.35]}>
        <boxGeometry args={[0.5, 1.5, 0.34]} />
        <meshStandardMaterial color="#23282e" roughness={0.6} metalness={0.4} />
      </mesh>
      {aspects.map(([colour, intensity], index) => (
        <mesh key={colour} position={[0, 4.9 - index * 0.46, 1.54]}>
          <circleGeometry args={[0.15, 14]} />
          <meshStandardMaterial
            color={colour}
            emissive={colour}
            emissiveIntensity={intensity * 6}
            roughness={0.3}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Glass-and-steel shelter on the north pavement. */
function BusShelter({ x, z }: { x: number; z: number }): ReactElement {
  return (
    <group position={[x, 0.17, z]}>
      {[-2.1, 2.1].map((end) => (
        <mesh key={end} castShadow position={[end, 1.3, 0]}>
          <boxGeometry args={[0.12, 2.6, 0.12]} />
          <meshStandardMaterial color="#3d434c" roughness={0.6} metalness={0.5} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 2.72, 0.35]}>
        <boxGeometry args={[5, 0.14, 1.8]} />
        <meshStandardMaterial color="#2f3641" roughness={0.55} metalness={0.4} />
      </mesh>
      <mesh position={[0, 1.3, -0.85]}>
        <boxGeometry args={[4.6, 2.4, 0.08]} />
        <meshStandardMaterial
          color="#243444"
          roughness={0.1}
          metalness={0.5}
          transparent
          opacity={0.55}
        />
      </mesh>
      <mesh castShadow position={[0, 0.55, -0.5]}>
        <boxGeometry args={[3.6, 0.1, 0.44]} />
        <meshStandardMaterial color="#7d838c" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, 2.3, -0.8]}>
        <planeGeometry args={[2.4, 0.7]} />
        <meshStandardMaterial color="#d8c27a" emissive="#8a6f28" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

/**
 * A market stall in the rear lane: trestle, striped canopy and a crate of
 * stock. The lane behind the shops is where the district is closest to the
 * lot, so this is where the extra life pays for itself.
 */
function Stall({ x, z, colour }: { x: number; z: number; colour: string }): ReactElement {
  return (
    <group position={[x, 0, z]}>
      <mesh castShadow position={[0, 0.85, 0]}>
        <boxGeometry args={[2.8, 0.12, 1.7]} />
        <meshStandardMaterial color="#8a6a45" roughness={0.85} />
      </mesh>
      {[-1.2, 1.2].map((side) => (
        <mesh key={side} castShadow position={[side, 0.42, 0]}>
          <boxGeometry args={[0.12, 0.85, 1.4]} />
          <meshStandardMaterial color="#6b5238" roughness={0.9} />
        </mesh>
      ))}
      {[-1.3, 1.3].map((side) => (
        <mesh key={`post-${side}`} castShadow position={[side, 1.3, -0.75]}>
          <boxGeometry args={[0.1, 2.6, 0.1]} />
          <meshStandardMaterial color={METAL} roughness={0.5} metalness={0.6} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 2.5, 0.1]} rotation={[0.16, 0, 0]}>
        <boxGeometry args={[3.2, 0.1, 2.4]} />
        <meshStandardMaterial color={colour} roughness={0.8} />
      </mesh>
      {/* Crates under the table edge, so the stall reads as stocked. */}
      {[-1.6, 1.6].map((side) => (
        <mesh key={`crate-${side}`} castShadow position={[side, 0.3, 0.4]} rotation={[0, side, 0]}>
          <boxGeometry args={[0.7, 0.6, 0.55]} />
          <meshStandardMaterial color="#c9853f" roughness={0.9} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.05, 0.2]}>
        <boxGeometry args={[1.6, 0.3, 0.9]} />
        <meshStandardMaterial color="#5d7a44" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Commercial bins at the far end of the service lane. */
function Dumpster({ x, z, rotY }: { x: number; z: number; rotY: number }): ReactElement {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh castShadow position={[0, 0.7, 0]}>
        <boxGeometry args={[2.4, 1.4, 1.5]} />
        <meshStandardMaterial color="#2f5f3f" roughness={0.75} metalness={0.25} />
      </mesh>
      <mesh castShadow position={[0, 1.46, 0]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[2.5, 0.14, 1.6]} />
        <meshStandardMaterial color="#274f35" roughness={0.7} metalness={0.3} />
      </mesh>
    </group>
  );
}

const STALL_COLOURS = ["#b8452f", "#2f6d5b", "#c9a44a", "#3f5f8a", "#8a3f6d", "#c47f2a"];

export function StreetFurniture(): ReactElement {
  const lights: { x: number; z: number; rotY: number }[] = [
    // Along the avenue, arms reaching over the road from each side.
    { x: -125, z: NA.roadN - 1, rotY: 0 },
    { x: -65, z: NA.roadN - 1, rotY: 0 },
    { x: -5, z: NA.roadN - 1, rotY: 0 },
    { x: 55, z: NA.roadN - 1, rotY: 0 },
    { x: 105, z: NA.roadN - 1, rotY: 0 },
    { x: -100, z: NA.paveS - 0.8, rotY: Math.PI },
    { x: -40, z: NA.paveS - 0.8, rotY: Math.PI },
    { x: 20, z: NA.paveS - 0.8, rotY: Math.PI },
    { x: 80, z: NA.paveS - 0.8, rotY: Math.PI },
    { x: EA.roadE + 1, z: -35, rotY: -Math.PI / 2 },
    { x: EA.roadE + 1, z: 5, rotY: -Math.PI / 2 },
    { x: EA.roadE + 1, z: 45, rotY: -Math.PI / 2 },
    { x: EA.paveW + 0.8, z: -30, rotY: Math.PI / 2 },
    { x: EA.paveW + 0.8, z: 30, rotY: Math.PI / 2 },
    // Along the rear service road, arms reaching north over the carriageway.
    { x: -10, z: LANE_LIGHT_Z, rotY: Math.PI },
    { x: 4, z: LANE_LIGHT_Z, rotY: Math.PI },
    { x: 18, z: LANE_LIGHT_Z, rotY: Math.PI },
    // Along the south avenue, arms reaching over the road from each side.
    { x: -115, z: SA.roadN - 1, rotY: 0 },
    { x: -55, z: SA.roadN - 1, rotY: 0 },
    { x: 5, z: SA.roadN - 1, rotY: 0 },
    { x: 65, z: SA.roadN - 1, rotY: 0 },
    { x: -90, z: SA.paveS - 0.8, rotY: Math.PI },
    { x: -30, z: SA.paveS - 0.8, rotY: Math.PI },
    { x: 30, z: SA.paveS - 0.8, rotY: Math.PI },
    { x: 90, z: SA.paveS - 0.8, rotY: Math.PI },
  ];

  const bins: { x: number; z: number }[] = [
    { x: -70, z: NA.roadN - 0.9 },
    { x: 15, z: NA.roadN - 0.9 },
    { x: -55, z: NA.paveS - 0.7 },
    { x: 70, z: NA.paveS - 0.7 },
    { x: EA.roadE + 0.9, z: -5 },
    { x: EA.roadE + 0.9, z: 40 },
    { x: EA.paveW + 0.7, z: -25 },
    { x: EA.paveW + 0.7, z: 25 },
    { x: -95, z: SA.roadN - 0.9 },
    { x: 45, z: SA.roadN - 0.9 },
    { x: -65, z: SA.paveS - 0.7 },
    { x: 65, z: SA.paveS - 0.7 },
    { x: -120, z: 9.9 },
    { x: -68, z: -9.9 },
    // Litter bins along the rear service road's promenade, at the kerb side.
    { x: -20, z: LANE_EDGE_Z },
    { x: 0, z: LANE_EDGE_Z },
    { x: 26, z: LANE_EDGE_Z },
  ];

  return (
    <group>
      <StreetTrees />

      {lights.map((light) => (
        <StreetLight key={`light-${light.x}-${light.z}`} {...light} />
      ))}

      <Bench x={-45} z={NA.roadN - 1.1} rotY={0} />
      <Bench x={40} z={NA.roadN - 1.1} rotY={0} />
      <Bench x={EA.roadE + 1.1} z={-20} rotY={-Math.PI / 2} />
      <Bench x={EA.roadE + 1.1} z={35} rotY={-Math.PI / 2} />
      <Bench x={-60} z={SA.roadN - 1.1} rotY={0} />
      <Bench x={50} z={SA.roadN - 1.1} rotY={0} />
      <Bench x={20} z={SA.paveS - 1.1} rotY={Math.PI} />
      <Bench x={6} z={LANE_EDGE_Z} rotY={Math.PI} />

      {bins.map((bin) => (
        <Bin key={`bin-${bin.x}-${bin.z}`} {...bin} />
      ))}

      <TrafficSignal x={EA.paveW + 0.9} z={NA.paveS - 1.1} />
      <TrafficSignal x={EA.roadE + 1.1} z={NA.paveS - 1.1} />
      <TrafficSignal x={EA.paveW + 0.9} z={SA.paveN + 1.1} />
      <TrafficSignal x={EA.roadE + 1.1} z={SA.paveN + 1.1} />

      <BusShelter x={-85} z={NA.roadN - 1.3} />

      {/* A tidy market row and its bin bay filling the narrow paved bay at
          the road's dead end, clear of the carriageway so the service road
          stays open. */}
      {[-41.5, -38, -34.5, -31, -27.5].map((x, index) => (
        <Stall
          key={x}
          x={x}
          z={LANE_MARKET_Z}
          colour={STALL_COLOURS[index] ?? "#c47f2a"}
        />
      ))}
      <Dumpster x={-48} z={LANE_MARKET_Z} rotY={Math.PI} />
      <Dumpster x={-45.2} z={LANE_MARKET_Z} rotY={Math.PI} />
    </group>
  );
}
