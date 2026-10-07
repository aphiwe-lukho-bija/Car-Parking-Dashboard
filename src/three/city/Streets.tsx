import { useEffect, useMemo, type ReactElement } from "react";
import * as THREE from "three";
import { EA, LANE, NA, SA } from "./layout";
import { Instances } from "./Instances";

/**
 * The street surfaces: three carriageways meeting in a four-way crossing,
 * their pavements, the service lane behind the shops, and every painted line.
 *
 * Hierarchy matters more than texture here — asphalt sits almost flush with the
 * verge, kerbs lift the pavement 17cm above it, and the joints and markings on
 * top are what stop either surface reading as a flat sheet of colour.
 */

const ROAD = "#3f434a";
const PAVING = "#9b9b93";
const PAVING_JOINT = "#8d887e";
const KERB = "#a6a69f";
const LINE = "#eef0f0";

/** A level surface defined by its extent, used for asphalt and paving. */
function Slab({
  x0,
  x1,
  z0,
  z1,
  y = 0.165,
  colour = PAVING,
}: {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y?: number;
  colour?: string;
}): ReactElement {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[(x0 + x1) / 2, y, (z0 + z1) / 2]}
      receiveShadow
    >
      <planeGeometry args={[x1 - x0, z1 - z0]} />
      <meshStandardMaterial color={colour} roughness={0.94} metalness={0.03} />
    </mesh>
  );
}

/** A kerb run, either along X or along Z. */
function Kerb({
  from,
  to,
  at,
  axis,
}: {
  from: number;
  to: number;
  at: number;
  axis: "x" | "z";
}): ReactElement {
  const length = to - from;
  const size: [number, number, number] =
    axis === "x" ? [length, 0.24, 0.3] : [0.3, 0.24, length];
  const position: [number, number, number] =
    axis === "x" ? [(from + to) / 2, 0.05, at] : [at, 0.05, (from + to) / 2];

  return (
    <mesh castShadow position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={KERB} roughness={0.9} metalness={0.02} />
    </mesh>
  );
}

function Surfaces(): ReactElement {
  return (
    <group>
      {/* The north and south avenues run the full width of the district; the
          east avenue joins them, so the three meet in a four-way crossing. */}
      <Slab x0={NA.x0} x1={NA.x1} z0={NA.roadN} z1={NA.roadS} y={-0.008} colour={ROAD} />
      <Slab x0={SA.x0} x1={SA.x1} z0={SA.roadN} z1={SA.roadS} y={-0.008} colour={ROAD} />
      <Slab x0={EA.roadW} x1={EA.roadE} z0={EA.z0} z1={EA.z1} y={-0.007} colour={ROAD} />

      {/* Pavements. The avenue pavements facing the junction are split so its
          mouth stays open for traffic turning in. */}
      <Slab x0={NA.x0} x1={NA.x1} z0={NA.roadN} z1={NA.paveN} />
      <Slab x0={NA.x0} x1={EA.roadW} z0={NA.roadS} z1={NA.paveS} />
      <Slab x0={EA.roadE} x1={NA.x1} z0={NA.roadS} z1={NA.paveS} />
      <Slab x0={SA.x0} x1={EA.roadW} z0={SA.paveN} z1={SA.roadN} />
      <Slab x0={EA.roadE} x1={SA.x1} z0={SA.paveN} z1={SA.roadN} />
      <Slab x0={SA.x0} x1={EA.roadW} z0={SA.roadS} z1={SA.paveS} />
      <Slab x0={EA.roadE} x1={SA.x1} z0={SA.roadS} z1={SA.paveS} />
      <Slab x0={EA.paveW} x1={EA.roadW} z0={NA.paveS} z1={SA.roadN} />
      <Slab x0={EA.roadE} x1={EA.paveE} z0={NA.paveS} z1={SA.roadN} />
      <Slab x0={EA.paveW} x1={EA.roadW} z0={SA.roadS} z1={EA.z1} />
      <Slab x0={EA.roadE} x1={EA.paveE} z0={SA.roadS} z1={EA.z1} />

      {/* Rear service lane, kept darker than the avenue: it is a working
          surface, not a promenade. */}
      <Slab x0={LANE.x0} x1={LANE.x1} z0={LANE.zN} z1={LANE.zS} y={-0.004} colour="#43474e" />
      <Kerb from={LANE.x0} to={LANE.x1} at={LANE.zN - 0.15} axis="x" />

      {/* Kerbs, broken at each junction mouth. */}
      <Kerb from={NA.x0} to={EA.roadW} at={NA.roadS + 0.15} axis="x" />
      <Kerb from={EA.roadE} to={NA.x1} at={NA.roadS + 0.15} axis="x" />
      <Kerb from={NA.x0} to={NA.x1} at={NA.roadN - 0.15} axis="x" />
      <Kerb from={SA.x0} to={EA.roadW} at={SA.roadN - 0.15} axis="x" />
      <Kerb from={EA.roadE} to={SA.x1} at={SA.roadN - 0.15} axis="x" />
      <Kerb from={SA.x0} to={EA.roadW} at={SA.roadS + 0.15} axis="x" />
      <Kerb from={EA.roadE} to={SA.x1} at={SA.roadS + 0.15} axis="x" />
      <Kerb from={NA.paveS} to={SA.roadN} at={EA.roadW - 0.15} axis="z" />
      <Kerb from={NA.paveS} to={SA.roadN} at={EA.roadE + 0.15} axis="z" />
      <Kerb from={SA.roadS} to={EA.z1} at={EA.roadW - 0.15} axis="z" />
      <Kerb from={SA.roadS} to={EA.z1} at={EA.roadE + 0.15} axis="z" />
    </group>
  );
}

/** Expansion joints across both avenue pavements, so they are not grey sheets. */
function PavingJoints(): ReactElement {
  const marks = useMemo(() => {
    const list: { x: number; z: number; length: number }[] = [];
    for (let x = NA.x0 + 10; x < NA.x1 - 6; x += 11) {
      list.push({ x, z: (NA.roadN + NA.paveN) / 2, length: NA.roadN - NA.paveN });
    }
    for (let x = SA.x0 + 6; x < SA.x1 - 6; x += 11) {
      if (x > EA.paveW - 4 && x < EA.paveE + 4) continue;
      list.push({ x, z: (SA.paveN + SA.roadN) / 2, length: SA.roadN - SA.paveN });
      list.push({ x, z: (SA.roadS + SA.paveS) / 2, length: SA.paveS - SA.roadS });
    }
    return list;
  }, []);

  return (
    <group>
      {marks.map((mark) => (
        <mesh
          key={`${mark.x}-${mark.z}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[mark.x, 0.168, mark.z]}
        >
          <planeGeometry args={[0.09, mark.length]} />
          <meshStandardMaterial color={PAVING_JOINT} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** Every painted line on both avenues, as one instanced set of quads. */
function Markings(): ReactElement {
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    return plane;
  }, []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: LINE, roughness: 0.75, metalness: 0.05 }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const matrices = useMemo(() => {
    const list: THREE.Matrix4[] = [];
    const add = (x: number, z: number, w: number, l: number, y = 0.004) => {
      list.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(x, y, z),
          new THREE.Quaternion(),
          new THREE.Vector3(w, 1, l),
        ),
      );
    };

    // Dashed centre lines, interrupted through each junction box.
    for (let x = NA.x0 + 4; x < NA.x1 - 4; x += 9) {
      if (x > EA.roadW - 3 && x < EA.roadE + 3) continue;
      add(x, (NA.roadN + NA.roadS) / 2, 3.2, 0.17);
    }
    for (let x = SA.x0 + 4; x < SA.x1 - 4; x += 9) {
      if (x > EA.roadW - 3 && x < EA.roadE + 3) continue;
      add(x, (SA.roadN + SA.roadS) / 2, 3.2, 0.17);
    }
    for (let z = NA.roadS + 4; z < EA.z1 - 4; z += 9) {
      if (z > SA.roadN - 3 && z < SA.roadS + 3) continue;
      add((EA.roadW + EA.roadE) / 2, z, 0.17, 3.2);
    }

    // Solid edge lines.
    add((NA.x0 + NA.x1) / 2, NA.roadN + 0.75, NA.x1 - NA.x0 - 6, 0.14, 0.003);
    add((NA.x0 + NA.x1) / 2, NA.roadS - 0.75, NA.x1 - NA.x0 - 6, 0.14, 0.003);
    add((SA.x0 + SA.x1) / 2, SA.roadN + 0.75, SA.x1 - SA.x0 - 6, 0.14, 0.003);
    add((SA.x0 + SA.x1) / 2, SA.roadS - 0.75, SA.x1 - SA.x0 - 6, 0.14, 0.003);
    add(EA.roadW + 0.75, (NA.paveS + SA.roadN) / 2, 0.14, SA.roadN - NA.paveS - 6, 0.003);
    add(EA.roadE - 0.75, (NA.paveS + SA.roadN) / 2, 0.14, SA.roadN - NA.paveS - 6, 0.003);
    add(EA.roadW + 0.75, (SA.roadS + EA.z1) / 2, 0.14, EA.z1 - SA.roadS - 2, 0.003);
    add(EA.roadE - 0.75, (SA.roadS + EA.z1) / 2, 0.14, EA.z1 - SA.roadS - 2, 0.003);

    // Zebra crossings: one over the north avenue west of the junction, one
    // over the east avenue south of it, one over the south avenue west of it.
    for (let i = 0; i < 8; i += 1) {
      add(-46 + i * 1.15, (NA.roadN + NA.roadS) / 2, 0.55, 11.4, 0.005);
      add((EA.roadW + EA.roadE) / 2, 14 + i * 1.15, 11.4, 0.55, 0.005);
      add(-46 + i * 1.15, (SA.roadN + SA.roadS) / 2, 0.55, 11.4, 0.005);
    }

    // Stop lines on the east and south approaches.
    add((EA.roadW + EA.roadE) / 2, NA.roadS - 1.6, EA.roadE - EA.roadW - 1.2, 0.45, 0.005);
    add(EA.roadW - 1.6, (SA.roadN + SA.roadS) / 2, 0.45, SA.roadS - SA.roadN - 1.2, 0.005);

    return list;
  }, []);

  return <Instances matrices={matrices} geometry={geometry} material={material} />;
}

export function Streets(): ReactElement {
  return (
    <group>
      <Surfaces />
      <PavingJoints />
      <Markings />
    </group>
  );
}
