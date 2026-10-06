import { useMemo } from "react";
import { LOT_HALF_DEPTH, LOT_HALF_WIDTH, LOT_MARGIN, GATE_X } from "@shared/lotLayout";
import { labelTexture } from "./labelTexture";
import { RoadSign } from "./RoadSign";

/**
 * Everything around the lot that is not the lot: the booth at the gate, the
 * signage, the bins, and the neighbouring buildings that give the horizon
 * something to be.
 *
 * All static. Costs nothing per frame and is most of what separates "a car
 * park model" from "a car park".
 */

const ROOF = "#39414b";
const WALL = "#8d8a80";
const WALL_DARK = "#6f6d66";
const GLASS = "#26333f";
const STEEL = "#5c636e";

/** Operator's cabin beside the entrance barrier. */
function GuardBooth() {
  const x = GATE_X - 2;
  return (
    <group position={[x, 0, -9.4]}>
      <mesh castShadow position={[0, 0.08, 0]}>
        <boxGeometry args={[3, 0.16, 2.8]} />
        <meshStandardMaterial color="#9a9a94" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 1.42, 0]}>
        <boxGeometry args={[2.6, 2.5, 2.3]} />
        <meshStandardMaterial color="#d9d6cd" roughness={0.6} metalness={0.05} />
      </mesh>
      {/* Glazing all round, so it reads as a booth rather than a shed. */}
      {[-1, 1].map((side) => (
        <mesh key={`side-${side}`} position={[side * 1.31, 1.75, 0]}>
          <boxGeometry args={[0.06, 1.25, 2]} />
          <meshStandardMaterial color={GLASS} roughness={0.12} metalness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 1.75, 1.16]}>
        <boxGeometry args={[2.2, 1.25, 0.06]} />
        <meshStandardMaterial color={GLASS} roughness={0.12} metalness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 2.78, 0]}>
        <boxGeometry args={[3, 0.18, 2.7]} />
        <meshStandardMaterial color={ROOF} roughness={0.7} metalness={0.2} />
      </mesh>
    </group>
  );
}

/** Three wheelie bins by the booth: small, but they place the site in a town. */
function Bins({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {[0, 1, 2].map((index) => (
        <group key={index} position={[index * 0.72, 0, (index % 2) * 0.12]}>
          <mesh castShadow position={[0, 0.48, 0]}>
            <boxGeometry args={[0.62, 0.96, 0.68]} />
            <meshStandardMaterial
              color={index === 0 ? "#2f6b4a" : index === 1 ? "#3b5f8a" : "#7a4646"}
              roughness={0.75}
            />
          </mesh>
          <mesh position={[0, 1.0, -0.02]} rotation={[-0.06, 0, 0]}>
            <boxGeometry args={[0.66, 0.09, 0.72]} />
            <meshStandardMaterial color="#1f2328" roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Traffic cones, doubled as a marker for where enforcement work happens. */
function Cones({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {[0, 1, 2, 3].map((index) => (
        <group key={index} position={[index * 1.1, 0, (index % 2) * 0.5]}>
          <mesh castShadow position={[0, 0.32, 0]}>
            <coneGeometry args={[0.22, 0.64, 12]} />
            <meshStandardMaterial color="#e8622c" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.15, 0.17, 0.1, 12]} />
            <meshStandardMaterial color="#f3f2ee" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.03, 0]}>
            <boxGeometry args={[0.5, 0.06, 0.5]} />
            <meshStandardMaterial color="#d8541f" roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Bollards({ x }: { x: number }) {
  return (
    <group>
      {[-1, 1].flatMap((side) =>
        [8.6, 12.4, 16.2].map((offset) => (
          <mesh key={`${side}:${offset}`} castShadow position={[x, 0.45, side * offset]}>
            <cylinderGeometry args={[0.11, 0.13, 0.9, 10]} />
            <meshStandardMaterial color={STEEL} roughness={0.5} metalness={0.7} />
          </mesh>
        )),
      )}
    </group>
  );
}

/** Round regulatory sign: a coloured disc with text on it. */
function DiscSign({
  position,
  rotationY = 0,
  text,
  textColour = "#1b1f24",
  disc = "#f3f2ee",
  ring = "#c0392b",
  radius = 0.42,
  pole = 2.1,
}: {
  position: [number, number, number];
  rotationY?: number;
  text: string;
  textColour?: string;
  disc?: string;
  ring?: string;
  radius?: number;
  pole?: number;
}) {
  const texture = useMemo(() => labelTexture(text, textColour), [text, textColour]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh castShadow position={[0, pole / 2, 0]}>
        <cylinderGeometry args={[0.05, 0.05, pole, 8]} />
        <meshStandardMaterial color="#6a707a" roughness={0.5} metalness={0.7} />
      </mesh>
      <mesh castShadow position={[0, pole + radius, 0]} rotation={[Math.PI / 2, 0, Math.PI / 8]}>
        <cylinderGeometry args={[radius, radius, 0.05, 8]} />
        <meshStandardMaterial color={ring} roughness={0.5} />
      </mesh>
      <mesh position={[0, pole + radius, 0.035]} rotation={[Math.PI / 2, 0, Math.PI / 8]}>
        <cylinderGeometry args={[radius * 0.82, radius * 0.82, 0.04, 8]} />
        <meshStandardMaterial color={disc} roughness={0.5} />
      </mesh>
      <mesh position={[0, pole + radius, 0.06]}>
        <planeGeometry args={[radius * 1.1, radius * 0.8]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

/** A neighbouring building: bulk, a parapet, and bands of glazing. */
function Building({
  position,
  size,
  rotationY = 0,
  wall,
  glazing = true,
}: {
  position: [number, number, number];
  size: [number, number, number];
  rotationY?: number;
  wall: string;
  glazing?: boolean;
}) {
  const [width, height, depth] = size;
  const bands = Math.max(1, Math.floor(height / 3.2));

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={wall} roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh castShadow position={[0, height + 0.28, 0]}>
        <boxGeometry args={[width + 0.5, 0.56, depth + 0.5]} />
        <meshStandardMaterial color={ROOF} roughness={0.8} metalness={0.1} />
      </mesh>

      {glazing
        ? Array.from({ length: bands }, (_, index) => (
            <mesh
              key={index}
              position={[0, 2 + index * 3.2, depth / 2 + 0.02]}
            >
              <boxGeometry args={[width * 0.86, 1.1, 0.08]} />
              <meshStandardMaterial color={GLASS} roughness={0.15} metalness={0.55} />
            </mesh>
          ))
        : null}
    </group>
  );
}

export function LotProps() {
  const edge = LOT_HALF_WIDTH + LOT_MARGIN;

  return (
    <group>
      <GuardBooth />
      <Bins x={GATE_X - 2.6} z={-12.4} />
      <Cones x={GATE_X + 2} z={7.4} />
      <Bollards x={-edge - 0.4} />

      {/* Regulatory signage at the throat of the site. */}
      <DiscSign
        position={[-46, 0, -9.8]}
        rotationY={-Math.PI / 2}
        text="STOP"
        textColour="#f3f2ee"
        disc="#c0392b"
        ring="#f3f2ee"
      />
      <DiscSign position={[-62, 0, -9.8]} rotationY={-Math.PI / 2} text="20" />
      <RoadSign
        position={[-edge + 1.6, 0, -13.5]}
        rotationY={Math.PI / 2}
        text="TOW-AWAY ZONE"
        width={3}
        boardColour="#5a1f1a"
      />
      <RoadSign
        position={[LOT_HALF_WIDTH, 0, LOT_HALF_DEPTH + 2.5]}
        rotationY={Math.PI}
        text="NO PARKING"
        width={2.6}
        boardColour="#1c2b4a"
      />

      {/* The neighbours. Sized and placed to sit beyond the fence, well inside
          the backdrop, so the lot reads as part of a town rather than a field. */}
      <Building position={[-58, 0, 62]} size={[78, 9.5, 26]} wall={WALL_DARK} glazing={false} />
      <Building position={[56, 0, -64]} size={[44, 18, 24]} wall={WALL} />
      <Building position={[76, 0, 18]} size={[26, 9, 22]} wall={WALL_DARK} glazing={false} />
      <Building position={[-110, 0, 46]} size={[34, 7.5, 20]} wall={WALL} />
    </group>
  );
}