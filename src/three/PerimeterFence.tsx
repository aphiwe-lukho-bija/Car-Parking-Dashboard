import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { LOT_HALF_DEPTH, LOT_HALF_WIDTH, LOT_MARGIN } from "@shared/lotLayout";

/**
 * The site boundary.
 *
 * A real palisade fence rather than a painted band: the lot is a secured
 * commercial yard, and the fence is most of what says so from a distance. The
 * west run stops either side of the carriageway so the road passes cleanly
 * through a gate opening, which is also what the arrivals and departures use.
 */

const FENCE_HEIGHT = 2.1;
const PALE_SPACING = 0.34;
const POST_SPACING = 3.4;

/** Sits just outside the tarmac edge, so the apron never reads as hollow. */
const HALF_X = LOT_HALF_WIDTH + LOT_MARGIN + 0.5;
const HALF_Z = LOT_HALF_DEPTH + LOT_MARGIN + 0.6;
/** Half-width of the opening where the access road crosses the boundary. */
const GATE_HALF = 7.8;

const STEEL = "#3a4740";
const RAIL = "#323d37";
const HEDGE = "#2f4a34";
const TRUNK = "#5b4632";
const LEAF = "#3d5c37";

interface Run {
  from: [number, number];
  to: [number, number];
}

const RUNS: Run[] = [
  { from: [-HALF_X, -HALF_Z], to: [HALF_X, -HALF_Z] },
  { from: [-HALF_X, HALF_Z], to: [HALF_X, HALF_Z] },
  { from: [HALF_X, -HALF_Z], to: [HALF_X, HALF_Z] },
  { from: [-HALF_X, -HALF_Z], to: [-HALF_X, -GATE_HALF] },
  { from: [-HALF_X, GATE_HALF], to: [-HALF_X, HALF_Z] },
];

/** A single run's geometry, plus the matrices for its pales and posts. */
function useFence() {
  return useMemo(() => {
    const pales: THREE.Matrix4[] = [];
    const posts: THREE.Matrix4[] = [];
    const rails: { position: [number, number, number]; rotationY: number; length: number }[] = [];

    const matrix = new THREE.Matrix4();

    for (const run of RUNS) {
      const dx = run.to[0] - run.from[0];
      const dz = run.to[1] - run.from[1];
      const length = Math.hypot(dx, dz);
      const ux = dx / length;
      const uz = dz / length;
      const rotationY = Math.atan2(ux, uz) - Math.PI / 2;

      // Pales: one instanced bar every spacing, pointed up as a palisade.
      for (let d = PALE_SPACING / 2; d < length; d += PALE_SPACING) {
        matrix.makeTranslation(run.from[0] + ux * d, FENCE_HEIGHT / 2, run.from[1] + uz * d);
        pales.push(matrix.clone());
      }

      // Posts, including both ends so a run always terminates on a post.
      for (let d = 0; d <= length + 0.01; d += POST_SPACING) {
        const clamped = Math.min(d, length);
        matrix.makeTranslation(run.from[0] + ux * clamped, 1.15, run.from[1] + uz * clamped);
        posts.push(matrix.clone());
      }

      for (const height of [0.55, 1.45, 1.98]) {
        rails.push({
          position: [run.from[0] + dx / 2, height, run.from[1] + dz / 2],
          rotationY,
          length,
        });
      }
    }

    return { pales, posts, rails };
  }, []);
}

function Fence() {
  const { pales, posts, rails } = useFence();
  const paleRef = useRef<THREE.InstancedMesh>(null);
  const postRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const paleMesh = paleRef.current;
    const postMesh = postRef.current;
    if (paleMesh === null || postMesh === null) return;

    pales.forEach((m, index) => paleMesh.setMatrixAt(index, m));
    posts.forEach((m, index) => postMesh.setMatrixAt(index, m));
    paleMesh.instanceMatrix.needsUpdate = true;
    postMesh.instanceMatrix.needsUpdate = true;
  }, [pales, posts]);

  return (
    <group>
      <instancedMesh ref={paleRef} args={[undefined, undefined, pales.length]} castShadow>
        <boxGeometry args={[0.05, FENCE_HEIGHT, 0.045]} />
        <meshStandardMaterial color={STEEL} roughness={0.6} metalness={0.5} />
      </instancedMesh>

      <instancedMesh ref={postRef} args={[undefined, undefined, posts.length]} castShadow>
        <boxGeometry args={[0.1, 2.3, 0.1]} />
        <meshStandardMaterial color="#2c352f" roughness={0.55} metalness={0.6} />
      </instancedMesh>

      {rails.map((rail) => (
        <mesh
          key={`${rail.position.join(",")}`}
          position={rail.position}
          rotation={[0, rail.rotationY, 0]}
          castShadow
        >
          <boxGeometry args={[rail.length, 0.06, 0.05]} />
          <meshStandardMaterial color={RAIL} roughness={0.6} metalness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** A street tree: trunk plus two stacked canopies. */
function Tree({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh castShadow position={[0, 1.15, 0]}>
        <cylinderGeometry args={[0.11, 0.17, 2.3, 8]} />
        <meshStandardMaterial color={TRUNK} roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0, 2.6, 0]}>
        <icosahedronGeometry args={[1.15, 1]} />
        <meshStandardMaterial color={LEAF} roughness={1} flatShading />
      </mesh>
      <mesh castShadow position={[0.25, 3.35, 0.15]}>
        <icosahedronGeometry args={[0.82, 1]} />
        <meshStandardMaterial color="#456b3c" roughness={1} flatShading />
      </mesh>
    </group>
  );
}

const TREES: { x: number; z: number; scale: number }[] = [
  { x: -HALF_X, z: -HALF_Z - 0.4, scale: 1.0 },
  { x: -16, z: HALF_Z + 2.6, scale: 1.05 },
  { x: 6, z: HALF_Z + 2.4, scale: 1.2 },
  { x: 24, z: HALF_Z + 2.9, scale: 0.95 },
  { x: -24, z: HALF_Z + 3.6, scale: 1.1 },
  { x: HALF_X + 2.8, z: -18, scale: 1.05 },
  { x: HALF_X + 3.2, z: 2, scale: 0.95 },
  { x: HALF_X + 2.6, z: 20, scale: 1.15 },
  { x: -52, z: -12.5, scale: 1.1 },
  { x: -74, z: -12.8, scale: 0.95 },
  { x: -98, z: -12.4, scale: 1.15 },
  { x: -124, z: -13.1, scale: 1.0 },
  { x: -56, z: 12.6, scale: 1.0 },
  { x: -108, z: 12.9, scale: 1.1 },
  { x: -140, z: 12.4, scale: 0.95 },
];

export function PerimeterFence() {
  return (
    <group>
      <Fence />

      {/* A hedge softens the south boundary. The north side is the shops'
          rear street, so its fence stands clear for the promenade to run up
          to and the street stays open to view. */}
      <mesh position={[0, 0.5, HALF_Z + 1.5]} castShadow>
        <boxGeometry args={[HALF_X * 2, 1.1, 1.3]} />
        <meshStandardMaterial color={HEDGE} roughness={1} metalness={0} />
      </mesh>

      {TREES.map((tree) => (
        <Tree key={`${tree.x}:${tree.z}`} x={tree.x} z={tree.z} scale={tree.scale} />
      ))}
    </group>
  );
}