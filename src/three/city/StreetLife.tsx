import { useMemo, useRef, type ReactElement } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { VehicleType } from "@shared/types";
import { CarModel } from "../CarModel";
import { EA, LANE, NA, SA } from "./layout";
import { Instances } from "./Instances";

/**
 * Who is out on the street: parked cars along every kerb, traffic moving
 * through the crossing, and pedestrians on every pavement.
 *
 * Parked vehicles are cheap six-mesh stand-ins because they never move and are
 * always seen from across the road; the moving ones are the full fleet model,
 * since they are what the eye tracks. Pedestrians are instanced in both cases
 * — two draws for the whole crowd, plus one pair per walker. Moving cars fade
 * in and out at the ends of their run, so wrapping never reads as a teleport.
 */

const PAVEMENT_Y = 0.17;

const PARKED_BODY = ["#c8ccd2", "#2f3b4a", "#8f2f2f", "#d9d4c8", "#2f6d5b", "#c9a44a", "#4a4f57"];

/** A stationary car at the kerb: body, cabin and four wheels. */
function StreetCar({
  x,
  z,
  rotY,
  colour,
}: {
  x: number;
  z: number;
  rotY: number;
  colour: string;
}): ReactElement {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.66, 0]}>
        <boxGeometry args={[1.86, 0.62, 4.4]} />
        <meshStandardMaterial color={colour} roughness={0.35} metalness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 1.16, -0.2]}>
        <boxGeometry args={[1.62, 0.5, 2.2]} />
        <meshStandardMaterial color="#1e2830" roughness={0.15} metalness={0.6} />
      </mesh>
      {([
        [0.85, 1.4],
        [-0.85, 1.4],
        [0.85, -1.4],
        [-0.85, -1.4],
      ] as [number, number][]).map(([side, along]) => (
        <mesh
          key={`${side}-${along}`}
          castShadow
          position={[side, 0.33, along]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.33, 0.33, 0.22, 12]} />
          <meshStandardMaterial color="#15181c" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

type Axis = "x" | "z";

interface TrafficSpec {
  axis: Axis;
  /** The lane line: Z for an east-west street, X for the north-south one. */
  lane: number;
  from: number;
  to: number;
  speed: number;
  rotY: number;
  plate: string;
  vehicleType: VehicleType;
  offset: number;
}

/** Opacity is left alone until it changes, so steady frames cost one compare. */
const EDGE_FADE = 18;

function applyEdgeFade(group: THREE.Group, opacity: number, cache: { value: number }): void {
  if (Math.abs(cache.value - opacity) < 0.015) return;
  cache.value = opacity;

  const visible = opacity > 0.02;
  group.visible = visible;
  if (!visible) return;

  const opaque = opacity > 0.985;
  group.traverse((child) => {
    const surface = child as THREE.Mesh;
    if (surface.isMesh !== true) return;
    const list = Array.isArray(surface.material) ? surface.material : [surface.material];
    for (const material of list) {
      const standard = material as THREE.MeshStandardMaterial;
      standard.transparent = !opaque;
      standard.opacity = opaque ? 1 : opacity;
      standard.depthWrite = opaque || opacity > 0.97;
    }
  });
}

/**
 * A vehicle running its loop, wrapping at the far ends of the street.
 *
 * `from` may sit east of `to`: the run then starts at `to`'s end and heads
 * back, which is how the westbound and northbound lanes are expressed — the
 * nose of the car and the direction it travels always agree.
 */
function TrafficCar({ spec }: { spec: TrafficSpec }): ReactElement {
  const ref = useRef<THREE.Group>(null);
  const travelled = useRef(spec.offset);
  const fade = useRef({ value: -1 });
  const direction = spec.to >= spec.from ? 1 : -1;
  const span = Math.abs(spec.to - spec.from);

  useFrame((_, rawDelta) => {
    const group = ref.current;
    if (group === null) return;
    const delta = Math.min(rawDelta, 0.1);
    travelled.current += spec.speed * delta;
    const position = travelled.current % span;
    const t = spec.from + direction * position;

    if (spec.axis === "x") {
      group.position.set(t, 0, spec.lane);
    } else {
      group.position.set(spec.lane, 0, t);
    }

    // Ease in and out over the last metres of the run, so the wrap point is
    // invisible: the car has already dissolved before it jumps.
    const edge = Math.min(position, span - position);
    applyEdgeFade(group, Math.min(1, edge / EDGE_FADE), fade.current);
  });

  const start = spec.from + direction * (spec.offset % span);
  const origin: [number, number, number] =
    spec.axis === "x" ? [start, 0, spec.lane] : [spec.lane, 0, start];

  return (
    <group ref={ref} position={origin} rotation={[0, spec.rotY, 0]}>
      <CarModel vehicleType={spec.vehicleType} plate={spec.plate} lightsOn />
    </group>
  );
}

const TRAFFIC: TrafficSpec[] = [
  // North avenue, left-hand traffic: eastbound hugs the north kerb.
  {
    axis: "x",
    lane: -55.5,
    from: NA.x0,
    to: NA.x1,
    speed: 12,
    rotY: Math.PI / 2,
    plate: "CA 418-229",
    vehicleType: "car",
    offset: 0,
  },
  {
    axis: "x",
    lane: -55.1,
    from: NA.x0,
    to: NA.x1,
    speed: 10.5,
    rotY: Math.PI / 2,
    plate: "CJ 902-114",
    vehicleType: "suv",
    offset: 150,
  },
  {
    axis: "x",
    lane: -51.5,
    from: NA.x1,
    to: NA.x0,
    speed: 13,
    rotY: -Math.PI / 2,
    plate: "CA 771-036",
    vehicleType: "car",
    offset: 90,
  },
  // East avenue: northbound keeps the west lane, southbound the east.
  {
    axis: "z",
    lane: 35.5,
    from: EA.z1,
    to: EA.z0,
    speed: 10,
    rotY: Math.PI,
    plate: "DK 55-812",
    vehicleType: "car",
    offset: 70,
  },
  {
    axis: "z",
    lane: 39.5,
    from: EA.z0,
    to: EA.z1,
    speed: 12,
    rotY: 0,
    plate: "CA 240-665",
    vehicleType: "suv",
    offset: 20,
  },
  // South avenue, left-hand traffic: eastbound hugs its north kerb.
  {
    axis: "x",
    lane: SA.roadN + 4,
    from: SA.x0,
    to: SA.x1,
    speed: 11.5,
    rotY: Math.PI / 2,
    plate: "CA 305-771",
    vehicleType: "car",
    offset: 60,
  },
  {
    axis: "x",
    lane: SA.roadS - 4,
    from: SA.x1,
    to: SA.x0,
    speed: 13,
    rotY: -Math.PI / 2,
    plate: "CJ 118-904",
    vehicleType: "suv",
    offset: 170,
  },
];

/** Kerbside parking, in the strips the lane markings leave either side. */
const PARKED: { x: number; z: number; rotY: number }[] = [
  { x: -95, z: -48.5, rotY: -Math.PI / 2 },
  { x: -55, z: -48.5, rotY: -Math.PI / 2 },
  { x: -15, z: -48.5, rotY: -Math.PI / 2 },
  { x: -75, z: -58.5, rotY: Math.PI / 2 },
  { x: 25, z: -58.5, rotY: Math.PI / 2 },
  { x: 32.5, z: -25, rotY: Math.PI },
  { x: 32.5, z: 30, rotY: Math.PI },
  { x: 42.5, z: 5, rotY: 0 },
  // South avenue, both strips, clear of the crossing and the junction.
  { x: -100, z: SA.roadN + 1, rotY: Math.PI / 2 },
  { x: -30, z: SA.roadN + 1, rotY: Math.PI / 2 },
  { x: 15, z: SA.roadN + 1, rotY: Math.PI / 2 },
  { x: 75, z: SA.roadN + 1, rotY: Math.PI / 2 },
  { x: -70, z: SA.roadS - 1, rotY: -Math.PI / 2 },
  { x: -10, z: SA.roadS - 1, rotY: -Math.PI / 2 },
  { x: 60, z: SA.roadS - 1, rotY: -Math.PI / 2 },
  { x: 100, z: SA.roadS - 1, rotY: -Math.PI / 2 },
];

const COATS = [
  "#3f5f8a",
  "#b8452f",
  "#2f6d5b",
  "#c9a44a",
  "#8a3f6d",
  "#d8d2c4",
  "#2f3b4a",
  "#a3ae9c",
];
const SKINS = ["#8d5a3b", "#c68642", "#f1c27d", "#6b4226", "#e0ac69"];

function pick(list: string[], index: number): string {
  return list[index % list.length] ?? list[0] ?? "#888888";
}

// Shared by the whole standing crowd: one material, two draws, thirty people.
const BODY_MATERIAL = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 });
const HEAD_MATERIAL = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.75 });

interface PersonSpec {
  x: number;
  z: number;
  rotY: number;
  scale: number;
  coat: string;
  skin: string;
}

function randomise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Everyone standing still: window shoppers, people waiting, a chat at the kerb. */
function StaticCrowd(): ReactElement {
  const people = useMemo<PersonSpec[]>(() => {
    const random = randomise(24601);
    const list: PersonSpec[] = [];
    const add = (x: number, z: number, rotY: number) => {
      list.push({
        x,
        z,
        rotY,
        scale: 0.88 + random() * 0.2,
        coat: pick(COATS, Math.floor(random() * COATS.length)),
        skin: pick(SKINS, Math.floor(random() * SKINS.length)),
      });
    };

    // North pavement of the avenue.
    for (const x of [-132, -108, -96, -76, -52, -28, -16, 8, 20, 44, 68, 92]) {
      add(x, NA.roadN - 1.1 + random() * 0.6, random() < 0.5 ? 0 : Math.PI);
    }
    // The lot-side pavement.
    for (const x of [-120, -90, -64, -32, -8, 52, 76, 100]) {
      add(x, NA.paveS - 0.7 - random() * 0.5, random() < 0.5 ? 0 : Math.PI);
    }
    // East avenue.
    for (const z of [-40, -24, 16, 32, 52]) {
      add(EA.roadE + 1.1 + random() * 0.5, z, Math.PI / 2);
    }
    for (const z of [-34, -14, 8, 44]) {
      add(EA.paveW + 0.7 - random() * 0.5, z, -Math.PI / 2);
    }
    // A couple of people at the stalls in the rear lane.
    for (const x of [-40, -17, 6, 18]) {
      add(x, LANE.zN + 0.8, 0);
    }
    // South avenue, both pavements.
    for (const x of [-128, -104, -72, -48, -20, 8, 24, 56, 88]) {
      add(x, SA.roadN - 1.1 + random() * 0.6, random() < 0.5 ? 0 : Math.PI);
    }
    for (const x of [-96, -60, -16, 40, 72, 104]) {
      add(x, SA.paveS - 0.7 - random() * 0.5, random() < 0.5 ? 0 : Math.PI);
    }
    // The access road corridor, on both pavements between the west blocks.
    for (const x of [-52, -76, -112, -146]) {
      add(x, -9.9 + random() * 0.5, random() < 0.5 ? 0 : Math.PI);
    }
    for (const x of [-58, -90, -124, -152]) {
      add(x, 9.4 + random() * 0.5, random() < 0.5 ? 0 : Math.PI);
    }
    // Outside the mall entrance, and on the verge by the lot's south fence.
    for (const x of [-44, -36, -30]) {
      add(x, -8.4, Math.PI);
    }
    for (const x of [-15, 5, 15]) {
      add(x, 41.2 + random() * 0.8, random() < 0.5 ? 0 : Math.PI);
    }
    return list;
  }, []);

  const body = useMemo(() => {
    const geometry = new THREE.CapsuleGeometry(0.27, 0.72, 4, 8);
    geometry.translate(0, 1.0, 0);
    return geometry;
  }, []);
  const head = useMemo(() => {
    const geometry = new THREE.SphereGeometry(0.2, 10, 8);
    geometry.translate(0, 1.8, 0);
    return geometry;
  }, []);

  const { bodyMatrices, headMatrices, coats, skins } = useMemo(() => {
    const bodyMatrices: THREE.Matrix4[] = [];
    const headMatrices: THREE.Matrix4[] = [];
    const coats: THREE.Color[] = [];
    const skins: THREE.Color[] = [];
    people.forEach((person) => {
      const position = new THREE.Vector3(person.x, PAVEMENT_Y, person.z);
      const quaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        person.rotY,
      );
      const scale = new THREE.Vector3(person.scale, person.scale, person.scale);
      bodyMatrices.push(new THREE.Matrix4().compose(position, quaternion, scale));
      headMatrices.push(new THREE.Matrix4().compose(position, quaternion, scale));
      coats.push(new THREE.Color(person.coat));
      skins.push(new THREE.Color(person.skin));
    });
    return { bodyMatrices, headMatrices, coats, skins };
  }, [people]);

  return (
    <group>
      <Instances
        matrices={bodyMatrices}
        colours={coats}
        geometry={body}
        material={BODY_MATERIAL}
        castShadow
      />
      <Instances
        matrices={headMatrices}
        colours={skins}
        geometry={head}
        material={HEAD_MATERIAL}
        castShadow
      />
    </group>
  );
}

interface WalkSpec {
  axis: Axis;
  lane: number;
  from: number;
  to: number;
  speed: number;
  rotY: number;
  offset: number;
  coat: string;
  skin: string;
  /** Under-14 proportions: shorter, quicker strides. */
  scale?: number;
}

/** A pedestrian striding their pavement, wrapping at the ends of the run. */
function Walker({ spec }: { spec: WalkSpec }): ReactElement {
  const ref = useRef<THREE.Group>(null);
  const travelled = useRef(spec.offset);
  const scale = spec.scale ?? 1;

  useFrame((_, rawDelta) => {
    const group = ref.current;
    if (group === null) return;
    const delta = Math.min(rawDelta, 0.1);
    travelled.current += spec.speed * delta;
    const span = spec.to - spec.from;
    const t = spec.from + (travelled.current % span);
    // A short stride bob: enough to read as walking from across the street.
    const bob = Math.abs(Math.sin(travelled.current * 3.4)) * 0.05;

    if (spec.axis === "x") {
      group.position.set(t, PAVEMENT_Y + bob, spec.lane);
    } else {
      group.position.set(spec.lane, PAVEMENT_Y + bob, t);
    }
  });

  return (
    <group
      ref={ref}
      position={[spec.from + spec.offset, PAVEMENT_Y, spec.lane]}
      rotation={[0, spec.rotY, 0]}
      scale={scale}
    >
      <mesh castShadow position={[0, 1.0, 0]}>
        <capsuleGeometry args={[0.27, 0.72, 4, 8]} />
        <meshStandardMaterial color={spec.coat} roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0, 1.8, 0]}>
        <sphereGeometry args={[0.2, 10, 8]} />
        <meshStandardMaterial color={spec.skin} roughness={0.75} />
      </mesh>
    </group>
  );
}

const WALKERS: WalkSpec[] = [
  {
    axis: "x",
    lane: NA.roadN - 1.2,
    from: NA.x0,
    to: NA.x1,
    speed: 1.4,
    rotY: Math.PI / 2,
    offset: 40,
    coat: pick(COATS, 0),
    skin: pick(SKINS, 1),
  },
  {
    axis: "x",
    lane: NA.roadN - 0.8,
    from: NA.x0,
    to: NA.x1,
    speed: 1.15,
    rotY: Math.PI / 2,
    offset: 210,
    coat: pick(COATS, 3),
    skin: pick(SKINS, 3),
  },
  {
    axis: "x",
    lane: NA.paveS - 0.9,
    from: NA.x0,
    to: NA.x1,
    speed: 1.3,
    rotY: Math.PI / 2,
    offset: 120,
    coat: pick(COATS, 5),
    skin: pick(SKINS, 0),
  },
  {
    axis: "z",
    lane: EA.roadE + 1.3,
    from: NA.paveS,
    to: EA.z1,
    speed: 1.25,
    rotY: 0,
    offset: 30,
    coat: pick(COATS, 6),
    skin: pick(SKINS, 2),
  },
  {
    axis: "z",
    lane: EA.paveW + 0.9,
    from: NA.paveS,
    to: EA.z1,
    speed: 1.35,
    rotY: 0,
    offset: 55,
    coat: pick(COATS, 7),
    skin: pick(SKINS, 4),
  },
  // South avenue, split either side of the crossing so nobody walks the road.
  {
    axis: "x",
    lane: SA.roadN - 0.6,
    from: SA.x0 + 5,
    to: EA.roadW,
    speed: 1.3,
    rotY: Math.PI / 2,
    offset: 25,
    coat: pick(COATS, 2),
    skin: pick(SKINS, 2),
  },
  {
    axis: "x",
    lane: SA.roadN - 0.6,
    from: EA.roadE,
    to: SA.x1 - 5,
    speed: 1.15,
    rotY: Math.PI / 2,
    offset: 12,
    coat: pick(COATS, 4),
    skin: pick(SKINS, 0),
  },
  {
    axis: "x",
    lane: SA.paveS - 0.7,
    from: SA.x0 + 10,
    to: EA.roadW,
    speed: 1.25,
    rotY: Math.PI / 2,
    offset: 90,
    coat: pick(COATS, 6),
    skin: pick(SKINS, 3),
  },
  {
    axis: "x",
    lane: SA.paveS - 0.7,
    from: EA.roadE,
    to: SA.x1 - 8,
    speed: 1.4,
    rotY: Math.PI / 2,
    offset: 60,
    coat: pick(COATS, 1),
    skin: pick(SKINS, 1),
  },
  // The access-road corridor, between the blocks that hide the fleet ends.
  {
    axis: "x",
    lane: -8.9,
    from: -158,
    to: -30,
    speed: 1.3,
    rotY: Math.PI / 2,
    offset: 40,
    coat: pick(COATS, 5),
    skin: pick(SKINS, 4),
  },
  {
    axis: "x",
    lane: 8.9,
    from: -150,
    to: -32,
    speed: 1.2,
    rotY: Math.PI / 2,
    offset: 110,
    coat: pick(COATS, 3),
    skin: pick(SKINS, 2),
  },
  // Children running along the pavements, quicker and shorter than the adults.
  {
    axis: "x",
    lane: SA.roadN - 0.9,
    from: -5,
    to: 28,
    speed: 2.7,
    rotY: Math.PI / 2,
    offset: 6,
    coat: pick(COATS, 1),
    skin: pick(SKINS, 4),
    scale: 0.6,
  },
  {
    axis: "x",
    lane: SA.paveS - 1,
    from: 45,
    to: 95,
    speed: 3,
    rotY: Math.PI / 2,
    offset: 20,
    coat: pick(COATS, 2),
    skin: pick(SKINS, 2),
    scale: 0.58,
  },
];

export function StreetLife(): ReactElement {
  return (
    <group>
      {PARKED.map((car) => (
        <StreetCar
          key={`parked-${car.x}-${car.z}`}
          x={car.x}
          z={car.z}
          rotY={car.rotY}
          colour={pick(PARKED_BODY, Math.abs(car.x + car.z) | 0)}
        />
      ))}

      {TRAFFIC.map((spec) => (
        <TrafficCar key={spec.plate} spec={spec} />
      ))}

      <StaticCrowd />
      {WALKERS.map((spec) => (
        <Walker key={`${spec.axis}-${spec.lane}-${spec.offset}`} spec={spec} />
      ))}
    </group>
  );
}
