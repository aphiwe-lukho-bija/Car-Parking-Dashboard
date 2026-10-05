import type { ReactElement } from "react";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import {
  BAYS,
  CENTRAL_AISLE_WIDTH,
  GATE_X,
  LOT_HALF_DEPTH,
  LOT_HALF_WIDTH,
  STAGING_X,
  type BaySlot,
} from "@shared/lotLayout";
import { GroundLabel } from "./GroundLabel";
import { PayPoint } from "./PayPoint";
import { OverstayMarker } from "./OverstayMarker";
import { useLotStore } from "../store/useLotStore";

const ASPHALT = "#4b4f57";
const AISLE_TINT = "#565b64";
const LINE = "#f4f1e8";
const GOLD = "#e8c34a";
/** Resurfacing patches, kept within a few percent of the base tarmac. */
const PATCH_A = "#4e525a";
const PATCH_B = "#484c53";
const CONCRETE = "#9a9a94";
const HEDGE = "#2f4a34";

/**
 * Wide tarmac slab with generous margin so the lot never looks cropped.
 *
 * Asphalt is not a flat colour in reality — it is laid in bays and patched, and
 * the variation is what stops it reading as a grey rectangle. Three subtly
 * different tones are laid as separate strips so the surface has visible
 * variation without a single texture download.
 */
function Tarmac() {
  const width = (LOT_HALF_WIDTH + 12) * 2;
  const depth = (LOT_HALF_DEPTH + 12) * 2;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={ASPHALT} roughness={0.92} metalness={0.04} />
      </mesh>

      {/* Weathering and resurfacing patches. Values sit within a few percent of
          the base so this reads as wear rather than as painted stripes. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-18, -0.014, 6]} receiveShadow>
        <planeGeometry args={[30, 17]} />
        <meshStandardMaterial color={PATCH_A} roughness={0.95} metalness={0.03} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[24, -0.013, -11]} receiveShadow>
        <planeGeometry args={[22, 26]} />
        <meshStandardMaterial color={PATCH_B} roughness={0.95} metalness={0.03} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2, -0.012, 20]} receiveShadow>
        <planeGeometry args={[38, 13]} />
        <meshStandardMaterial color={PATCH_A} roughness={0.95} metalness={0.03} />
      </mesh>
    </group>
  );
}

/**
 * Concrete wheel stops at the head of each bay.
 *
 * The single cheapest cue that this is a car park rather than an empty slab:
 * they give the rows depth and a clear read on which way the bays face.
 */
function WheelStops() {
  return (
    <group>
      {BAYS.map((bay) => (
        <mesh
          key={`stop-${bay.spaceNumber}`}
          position={[bay.position.x, 0.09, bay.position.z + bay.depth / 2 - 0.5]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[bay.width * 0.62, 0.18, 0.2]} />
          <meshStandardMaterial color={CONCRETE} roughness={0.88} metalness={0.02} />
        </mesh>
      ))}
    </group>
  );
}

/** Painted directional arrows down the central aisle, plus a hatched no-parking
 *  box at the gate where the two flows cross. */
function RoadMarkings() {
  const arrowAt = (x: number): ReactElement => (
    <group key={`arrow-${x}`} position={[x, 0.012, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]}>
      <mesh position={[0, 0, 1.5]}>
        <planeGeometry args={[0.34, 3]} />
        <meshStandardMaterial color={LINE} roughness={0.8} metalness={0.02} />
      </mesh>
      <mesh position={[0, 0, -0.5]} rotation={[0, 0, 0]}>
        <circleGeometry args={[0.85, 3]} />
        <meshStandardMaterial color={LINE} roughness={0.8} metalness={0.02} />
      </mesh>
    </group>
  );

  return (
    <group>
      {[-LOT_HALF_WIDTH * 0.6, -LOT_HALF_WIDTH * 0.15, LOT_HALF_WIDTH * 0.35].map(arrowAt)}

      {/* Hatched keep-clear box in front of the gate. */}
      <group position={[GATE_X + 9, 0.011, 0]}>
        {Array.from({ length: 7 }, (_, index) => (
          <mesh
            key={`hatch-${index}`}
            rotation={[-Math.PI / 2, 0, Math.PI / 5]}
            position={[index * 1.5 - 4.5, 0, 0]}
          >
            <planeGeometry args={[0.2, 6.5]} />
            <meshStandardMaterial color={LINE} roughness={0.8} metalness={0.02} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Kerbed islands that separate the sections and break up the tarmac. */
function KerbedIslands() {
  const islands: { x: number; z: number; w: number; d: number }[] = [
    { x: -LOT_HALF_WIDTH * 0.72, z: CENTRAL_AISLE_WIDTH / 2 + 3.4, w: 9, d: 1.5 },
    { x: LOT_HALF_WIDTH * 0.72, z: CENTRAL_AISLE_WIDTH / 2 + 3.4, w: 9, d: 1.5 },
    { x: -LOT_HALF_WIDTH * 0.72, z: -(CENTRAL_AISLE_WIDTH / 2 + 3.4), w: 9, d: 1.5 },
    { x: LOT_HALF_WIDTH * 0.72, z: -(CENTRAL_AISLE_WIDTH / 2 + 3.4), w: 9, d: 1.5 },
  ];

  return (
    <group>
      {islands.map((island) => (
        <group key={`island-${island.x}-${island.z}`} position={[island.x, 0, island.z]}>
          <mesh position={[0, 0.07, 0]} castShadow receiveShadow>
            <boxGeometry args={[island.w, 0.14, island.d]} />
            <meshStandardMaterial color={CONCRETE} roughness={0.9} metalness={0.02} />
          </mesh>
          <mesh position={[0, 0.55, 0]} castShadow>
            <boxGeometry args={[island.w * 0.82, 0.9, island.d * 0.7]} />
            <meshStandardMaterial color={HEDGE} roughness={1} metalness={0} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Darker painted surface marking the drive aisles. */
function Aisles() {
  const central = CENTRAL_AISLE_WIDTH;

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
      <mesh position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[(LOT_HALF_WIDTH + 10) * 2, central]} />
        <meshStandardMaterial color={AISLE_TINT} roughness={0.86} metalness={0.06} />
      </mesh>
    </group>
  );
}

/**
 * Painted bay outline.
 *
 * Drawn as four thin quads rather than a single plane with a texture so the
 * markings stay crisp at any zoom and cost nothing to download.
 */
function BayMarkings({ bay, tint }: { bay: BaySlot; tint: string }) {
  const { width, depth, position } = bay;
  const t = 0.11;
  const { x, z } = position;

  const bars: { position: [number, number, number]; size: [number, number] }[] = [
    { position: [0, -depth / 2, 0], size: [width, t] },
    { position: [-width / 2, 0, 0], size: [t, depth] },
    { position: [width / 2, 0, 0], size: [t, depth] },
    { position: [0, depth / 2, 0], size: [width, t] },
  ];

  return (
    <group position={[x, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]}>
      {bars.map((bar) => (
        <mesh key={bar.position.join(",")} position={bar.position}>
          <planeGeometry args={bar.size} />
          <meshStandardMaterial
            color={tint}
            emissive={tint}
            emissiveIntensity={tint === LINE ? 0.02 : 0.12}
            roughness={0.72}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Pulsing red wash under a bay whose stay has been formally flagged.
 *
 * Separate from `BayGlow` because this is an enforcement signal, not a
 * selection cue: it has to be unmissable from the back of the lot while
 * presenting.
 */
function OverstayGlow({ bay }: { bay: BaySlot }) {
  const material = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const mat = material.current;
    if (mat === null) return;
    mat.opacity = 0.22 + Math.sin(clock.elapsedTime * 2.2) * 0.12;
  });

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[bay.position.x, 0.008, bay.position.z]}
    >
      <planeGeometry args={[bay.width * 1.6, bay.depth * 1.5]} />
      <meshBasicMaterial
        ref={material}
        color="#ff3355"
        transparent
        opacity={0.25}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

/** Soft pool of light under an occupied bay, brightened when it is selected. */
function BayGlow({ bay, selected }: { bay: BaySlot; selected: boolean }) {
  const colour = selected ? GOLD : "#2fbf7f";

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[bay.position.x, 0.006, bay.position.z]}
    >
      <planeGeometry args={[bay.width * 1.25, bay.depth * 1.15]} />
      <meshBasicMaterial
        color={colour}
        transparent
        opacity={selected ? 0.22 : 0.09}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function BayLabel({ bay }: { bay: BaySlot }) {
  const inFront = bay.position.z < 0 ? 1 : -1;

  return (
    <GroundLabel
      position={[bay.position.x, 0.02, bay.position.z + inFront * (bay.depth / 2 + 0.6)]}
      text={bay.spaceNumber}
      height={0.62}
      opacity={0.7}
    />
  );
}

function BayZone({ bay }: { bay: BaySlot }) {
  const space = useLotStore((state) =>
    state.spaces.find((candidate) => candidate.spaceNumber === bay.spaceNumber),
  );
  const selected = useLotStore((state) => state.selectedBay === bay.spaceNumber);
  const selectBay = useLotStore((state) => state.selectBay);

  const occupied = space?.status === "occupied";
  const overstay = space?.session?.isOverstay === true;

  return (
    <group
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
      onClick={(event) => {
        event.stopPropagation();
        selectBay(selected ? null : bay.spaceNumber);
      }}
    >
      <BayMarkings bay={bay} tint={overstay ? "#ff5a72" : occupied ? GOLD : LINE} />
      {overstay ? <OverstayGlow bay={bay} /> : null}
      {occupied && !overstay ? <BayGlow bay={bay} selected={selected} /> : null}
      <BayLabel bay={bay} />
      {overstay ? <OverstayMarker bay={bay} /> : null}
    </group>
  );
}

/** Section headers floating above each row. */
function SectionSigns() {
  const signs = useMemo(() => {
    const seen = new Map<string, { z: number; side: number }>();
    for (const bay of BAYS) {
      const existing = seen.get(bay.section);
      if (existing === undefined) {
        seen.set(bay.section, { z: bay.position.z, side: bay.position.z < 0 ? -1 : 1 });
      }
    }
    return [...seen.entries()];
  }, []);

  return (
    <group>
      {signs.map(([code, info]) => {
        const z = info.z + info.side * 3.1;
        return (
          <GroundLabel
            key={code}
            position={[-LOT_HALF_WIDTH - 2.2, 0.02, z + info.side * 1.6]}
            text={`ZONE ${code}`}
            colour={GOLD}
            height={1.7}
            opacity={0.34}
          />
        );
      })}
    </group>
  );
}

/** The boom gate at the west end of the central aisle. */
function BoomGate() {
  const barrier = GATE_X;

  return (
    <group position={[barrier, 0, 0]}>
      {[-1, 1].map((side) => (
        <group key={side} position={[0, 0, side * (CENTRAL_AISLE_WIDTH / 2 + 0.4)]}>
          <mesh castShadow position={[0, 0.75, 0]}>
            <boxGeometry args={[0.5, 1.5, 0.5]} />
            <meshStandardMaterial color="#5c636e" roughness={0.5} metalness={0.7} />
          </mesh>
          <mesh position={[0, 1.56, 0]}>
            <boxGeometry args={[0.56, 0.12, 0.56]} />
            {/* Reflective band, not a light: an emissive cap in daylight reads
                as a glowing toy rather than a safety bollard. */}
            <meshStandardMaterial
              color="#f5c542"
              emissive="#f5c542"
              emissiveIntensity={0.6}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Lamp posts down the length of the central aisle. Unlit in daylight, but
 *  they carry the signage and the lot reads as a real facility rather than a
 *  bare slab. */
function LampPosts() {
  const count = 5;
  const spacing = (LOT_HALF_WIDTH * 2) / (count - 1);

  return (
    <group>
      {Array.from({ length: count }, (_, index) => {
        const x = -LOT_HALF_WIDTH + index * spacing;
        return (
          <group key={x} position={[x, 0, CENTRAL_AISLE_WIDTH / 2 + 1.6]}>
            <mesh castShadow position={[0, 2.8, 0]}>
              <cylinderGeometry args={[0.1, 0.16, 5.6, 10]} />
              <meshStandardMaterial color="#6a707a" roughness={0.55} metalness={0.65} />
            </mesh>
            <mesh position={[0, 5.5, 0]}>
              <boxGeometry args={[0.5, 0.14, 0.9]} />
              <meshStandardMaterial color="#7b828c" roughness={0.45} metalness={0.7} />
            </mesh>
            <mesh position={[0, 5.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.42, 0.8]} />
              <meshStandardMaterial color="#cfd4dc" roughness={0.25} metalness={0.3} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Faint perimeter hedge so the lot has a boundary. */
function Perimeter() {
  const width = (LOT_HALF_WIDTH + 10) * 2;
  const z = LOT_HALF_DEPTH + 7;

  return (
    <group>
      {[z, -z].map((offset) => (
        <mesh key={`hedge-${offset}`} position={[0, 0.5, offset]} castShadow>
          <boxGeometry args={[width, 1.1, 1.4]} />
          <meshStandardMaterial color={HEDGE} roughness={1} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

export function LotScene() {
  const selectBay = useLotStore((state) => state.selectBay);

  return (
    <group onClick={() => selectBay(null)}>
      <Tarmac />
      <Aisles />
      <RoadMarkings />
      <KerbedIslands />
      <Perimeter />
      {BAYS.map((bay) => (
        <BayZone key={bay.spaceNumber} bay={bay} />
      ))}
      <WheelStops />
      <SectionSigns />
      <BoomGate />
      <PayPoint />
      <LampPosts />

      {/* Entry throat beyond the gate, where arriving vehicles appear */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(GATE_X + STAGING_X) / 2, 0.004, 0]}>
        <planeGeometry args={[Math.abs(GATE_X - STAGING_X), CENTRAL_AISLE_WIDTH]} />
        <meshStandardMaterial color="#43474e" roughness={0.94} />
      </mesh>
    </group>
  );
}