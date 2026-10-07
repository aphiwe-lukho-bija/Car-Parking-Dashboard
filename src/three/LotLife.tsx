import { useMemo, useRef, type ReactElement } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Instances } from "./city/Instances";

/**
 * Life inside the fence: shoppers crossing the aisle, kids tearing around the
 * apron, a pair chatting by the pay point.
 *
 * The routes stay on the walkways people would actually use — down the middle
 * of the central aisle, along the aprons north and south of the bays, and in
 * and out through the gate throat — so nobody strolls through a parked car.
 * Everything standing is instanced: eleven bodies, two draws.
 */

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

interface LotWalkSpec {
  axis: "x" | "z";
  lane: number;
  from: number;
  to: number;
  speed: number;
  rotY: number;
  offset: number;
  coat: string;
  skin: string;
  /** Child proportions: shorter, quicker strides. */
  scale?: number;
}

/** A pedestrian striding the tarmac, wrapping at the ends of their run. */
function LotWalker({ spec }: { spec: LotWalkSpec }): ReactElement {
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
    const bob = Math.abs(Math.sin(travelled.current * 3.6)) * 0.05;

    if (spec.axis === "x") {
      group.position.set(t, bob, spec.lane);
    } else {
      group.position.set(spec.lane, bob, t);
    }
  });

  return (
    <group
      ref={ref}
      position={[spec.from + spec.offset, 0, spec.lane]}
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

const WALKERS: LotWalkSpec[] = [
  // Down the middle of the central aisle, each side of the driving line.
  {
    axis: "x",
    lane: 3.5,
    from: -19,
    to: 16,
    speed: 1.3,
    rotY: Math.PI / 2,
    offset: 5,
    coat: pick(COATS, 0),
    skin: pick(SKINS, 1),
  },
  {
    axis: "x",
    lane: -3.5,
    from: -19,
    to: 16,
    speed: 1.1,
    rotY: Math.PI / 2,
    offset: 44,
    coat: pick(COATS, 3),
    skin: pick(SKINS, 3),
  },
  // Along the south apron and the north walkway behind the shop fronts.
  {
    axis: "x",
    lane: 34,
    from: -20,
    to: 20,
    speed: 1.35,
    rotY: Math.PI / 2,
    offset: 20,
    coat: pick(COATS, 5),
    skin: pick(SKINS, 0),
  },
  {
    axis: "x",
    lane: -34,
    from: -16,
    to: 16,
    speed: 1.2,
    rotY: Math.PI / 2,
    offset: 60,
    coat: pick(COATS, 7),
    skin: pick(SKINS, 2),
  },
  // In through the gate throat, where the fence opens for the access road.
  {
    axis: "x",
    lane: 6.5,
    from: -23.5,
    to: -10,
    speed: 1.25,
    rotY: Math.PI / 2,
    offset: 8,
    coat: pick(COATS, 6),
    skin: pick(SKINS, 4),
  },
  // Children running the apron behind Zone D, quicker and shorter than adults.
  {
    axis: "x",
    lane: 33,
    from: -8,
    to: 8,
    speed: 3.2,
    rotY: Math.PI / 2,
    offset: 3,
    coat: pick(COATS, 1),
    skin: pick(SKINS, 4),
    scale: 0.55,
  },
  {
    axis: "x",
    lane: 35.5,
    from: 2,
    to: 14,
    speed: 2.9,
    rotY: Math.PI / 2,
    offset: 11,
    coat: pick(COATS, 2),
    skin: pick(SKINS, 2),
    scale: 0.58,
  },
  {
    axis: "z",
    lane: -12,
    from: 31,
    to: 36,
    speed: 3.1,
    rotY: 0,
    offset: 4,
    coat: pick(COATS, 4),
    skin: pick(SKINS, 3),
    scale: 0.6,
  },
];

interface StandSpec {
  x: number;
  z: number;
  rotY: number;
  scale: number;
  coat: string;
  skin: string;
}

/** Everyone standing inside the fence: browsers, chats, someone waiting. */
function LotCrowd(): ReactElement {
  const people = useMemo<StandSpec[]>(() => {
    const random = randomise(90210);
    const list: StandSpec[] = [];
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

    // Browsing the shop fronts that back onto Zone A.
    add(11, -21.6, Math.PI);
    add(13.5, -21.3, Math.PI);
    add(15.5, -21.9, Math.PI * 0.85);
    // Window shopping down the numbered row on the east fence.
    add(16.3, -17.8, Math.PI / 2);
    add(16.3, 18.5, Math.PI / 2);
    // A pair chatting by the pay point, someone waiting at the gate.
    add(-15.5, 7.5, -Math.PI / 2);
    add(-14.7, 8.1, Math.PI / 2);
    add(-19, -6.5, -Math.PI / 2);
    // A couple taking in the apron behind Zone D.
    add(6, 33.5, 0);
    add(6.8, 34.3, Math.PI);
    add(-19.5, 12, 0);
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
      const position = new THREE.Vector3(person.x, 0, person.z);
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

const BODY_MATERIAL = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 });
const HEAD_MATERIAL = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.75 });

export function LotLife(): ReactElement {
  return (
    <group>
      <LotCrowd />
      {WALKERS.map((spec) => (
        <LotWalker
          key={`${spec.axis}-${spec.lane}-${spec.offset}`}
          spec={spec}
        />
      ))}
    </group>
  );
}
