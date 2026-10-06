import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { LOT_HALF_DEPTH, LOT_HALF_WIDTH } from "@shared/lotLayout";

/**
 * Table Mountain, seen from the Foreshore looking west.
 *
 * Built as a silhouette ridge rather than a textured model: the read that
 * matters is the flat-topped profile with Devil's Peak beside it, and a
 * silhouette costs nothing to draw and never looks wrong from a distance.
 */
const RIDGE_PROFILE: readonly [number, number][] = [
  // [distance along the ridge, height] — left to right, normalised 0..1.
  [0.0, 0.22],
  [0.09, 0.38],
  [0.17, 0.55],
  [0.26, 0.74],
  [0.34, 0.9],
  [0.42, 1.0],
  [0.56, 1.0], // the flat top
  [0.63, 0.93],
  [0.7, 0.78],
  [0.78, 0.62],
  [0.85, 0.5],
  [0.93, 0.31],
  [1.0, 0.16],
];

const DEVILS_PEAK: readonly [number, number][] = [
  [0.0, 0.1],
  [0.18, 0.34],
  [0.34, 0.72],
  [0.5, 1.0],
  [0.66, 0.74],
  [0.84, 0.36],
  [1.0, 0.12],
];

interface RidgeSpec {
  /** Distance from the lot, along -Z. */
  distance: number;
  width: number;
  height: number;
  profile: readonly [number, number][];
  colour: string;
}

function buildRidgeGeometry(
  profile: readonly [number, number][],
  width: number,
  height: number,
  segments: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  // Extrude the profile along X, then give it a flat top cap and a front face
  // so it reads as a solid mass rather than a cardboard cut-out.
  for (let i = 0; i < profile.length; i += 1) {
    const [t, h] = profile[i] ?? [0, 0];
    const x = (t - 0.5) * width;
    positions.push(x, h * height, 0, x, 0, 0);
  }

  for (let i = 0; i < profile.length - 1; i += 1) {
    const top = i * 2;
    const bottom = top + 1;
    const nextTop = top + 2;
    const nextBottom = top + 3;
    indices.push(top, bottom, nextBottom, top, nextBottom, nextTop);
  }

  void segments;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function Ridge({ distance, width, height, profile, colour }: RidgeSpec) {
  const geometry = useMemo(
    () => buildRidgeGeometry(profile, width, height, profile.length),
    [profile, width, height],
  );

  return (
    <mesh geometry={geometry} position={[0, 0, -distance]} frustumCulled={false}>
      <meshBasicMaterial color={colour} toneMapped={false} fog={false} />
    </mesh>
  );
}

/**
 * The surrounding city and the mountain behind it.
 *
 * Three receding ridge bands plus a low skyline give the lot a horizon to sit
 * in. Without it, zooming out to altitude just reveals the edge of the tarmac
 * floating in void, which is what the clouds need to read against.
 */
export function CapeTownBackdrop() {
  const skyline = useMemo(() => {
    // Deterministic pseudo-random source: a self-contained integer hash, so the
    // skyline is identical on every reload without a mutable closure variable.
    const random = (n: number): number => {
      const x = Math.sin(n * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };

    return Array.from({ length: 64 }, (_, index) => {
      const t = index / 63;
      const x = (t - 0.5) * (LOT_HALF_WIDTH + 300) * 2;
      const base = 6 + random(index + 1) * 4;
      const tower = random(index + 1) > 0.82 ? random(index + 101) * 26 : 0;
      return { x, width: 5 + random(index + 51) * 7, height: base + tower };
    });
  }, []);

  const blocksRef = useRef<THREE.InstancedMesh>(null);
  const blockGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const blockMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#5a5f6b", roughness: 0.95, metalness: 0.05 }),
    [],
  );
  useEffect(
    () => () => {
      blockGeometry.dispose();
      blockMaterial.dispose();
    },
    [blockGeometry, blockMaterial],
  );

  useEffect(() => {
    const mesh = blocksRef.current;
    if (mesh === null) return;

    // One instanced draw for the whole skyline instead of a mesh, geometry and
    // material per block. The city never moves, so the matrices are written once.
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();

    skyline.forEach((block, index) => {
      position.set(block.x, block.height / 2, 0);
      scale.set(block.width, block.height, 10);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [skyline]);

  return (
    <group>
      {/* Far ridges: hazier and cooler the further back they sit. */}
      <Ridge
        distance={1500}
        width={2600}
        height={340}
        profile={[
          [0, 0.3],
          [0.3, 0.5],
          [0.6, 0.44],
          [1, 0.28],
        ]}
        colour="#8fa3bd"
      />

      <Ridge
        distance={1180}
        width={2200}
        height={300}
        profile={[
          [0, 0.24],
          [0.35, 0.62],
          [0.55, 0.58],
          [0.8, 0.4],
          [1, 0.2],
        ]}
        colour="#6d7f9b"
      />

      {/* Table Mountain's flat top, then Devil's Peak offset to its right. */}
      <Ridge
        distance={900}
        width={1900}
        height={430}
        profile={RIDGE_PROFILE}
        colour="#4a5568"
      />
      <Ridge
        distance={880}
        width={620}
        height={330}
        profile={DEVILS_PEAK}
        colour="#3f4a5c"
      />

      {/* City blocks sitting on the plain in front of the mountain. The whole
          skyline is one instanced mesh, so the horizon costs a single draw
          call instead of sixty-four. */}
      <instancedMesh
        ref={blocksRef}
        position={[0, 0, -720]}
        args={[blockGeometry, blockMaterial, skyline.length]}
        frustumCulled={false}
      />

      {/* Distant flats/waterfront edge, catching the low sun. */}
      <mesh position={[0, 1.5, -LOT_HALF_DEPTH - 200]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2400, 420]} />
        <meshStandardMaterial color="#7d7a70" roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}