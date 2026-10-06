import { LOT_HALF_WIDTH, LOT_MARGIN } from "@shared/lotLayout";
import { GroundLabel } from "./GroundLabel";
import { RoadSign } from "./RoadSign";

/**
 * The street the site sits on.
 *
 * Before this the lot was a slab on nothing: cars drove off the tarmac and
 * carried on over the horizon, and every arrival materialised out of clear sky
 * beside the gate. A ground plane, a kerbed access road and a few metres of
 * verge are what make the drive-in and the drive-out read as a place a vehicle
 * can actually come from and go to.
 */

const VERGE = "#5f6444";
const ROAD = "#3f434a";
const KERB = "#a6a69f";
const PAVING = "#9b9b93";
const LINE = "#eef0f0";

/** West edge of the tarmac slab, which is also where the road begins. */
const TARMAC_EDGE = -(LOT_HALF_WIDTH + LOT_MARGIN);
const ROAD_HALF_WIDTH = 7;
const ROAD_END = -170;
const LENGTH = TARMAC_EDGE - ROAD_END;
const CENTER = (TARMAC_EDGE + ROAD_END) / 2;

/** Roadside lamp standard with its arm out over the carriageway. */
function StreetLight({ x, side }: { x: number; side: -1 | 1 }) {
  return (
    <group position={[x, 0, side * (ROAD_HALF_WIDTH + 2.4)]}>
      <mesh castShadow position={[0, 3.6, 0]}>
        <cylinderGeometry args={[0.1, 0.15, 7.2, 10]} />
        <meshStandardMaterial color="#6a707a" roughness={0.55} metalness={0.65} />
      </mesh>
      <mesh castShadow position={[0, 7.05, -side * 1.25]} rotation={[-side * 0.22, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 2.6, 8]} />
        <meshStandardMaterial color="#6a707a" roughness={0.55} metalness={0.65} />
      </mesh>
      <mesh position={[0, 6.72, -side * 2.3]}>
        <boxGeometry args={[0.3, 0.16, 0.72]} />
        <meshStandardMaterial color="#cfd4dc" roughness={0.3} metalness={0.4} />
      </mesh>
    </group>
  );
}

/** Bus shelter on the southern pavement, to break up a long empty kerb. */
function BusShelter({ x }: { x: number }) {
  return (
    <group position={[x, 0, ROAD_HALF_WIDTH + 3.2]}>
      {[-2.1, 2.1].map((end) => (
        <mesh key={end} castShadow position={[end, 1.3, -1]}>
          <boxGeometry args={[0.12, 2.6, 0.12]} />
          <meshStandardMaterial color="#3d434c" roughness={0.6} metalness={0.5} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 2.72, -0.35]}>
        <boxGeometry args={[5, 0.14, 1.7]} />
        <meshStandardMaterial color="#2f3641" roughness={0.55} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.62, -1.25]}>
        <boxGeometry args={[4.2, 0.1, 0.5]} />
        <meshStandardMaterial color="#7d838c" roughness={0.6} metalness={0.4} />
      </mesh>
    </group>
  );
}

export function AccessRoad() {
  const dashes: number[] = [];
  for (let x = TARMAC_EDGE - 9; x > ROAD_END + 8; x -= 8) dashes.push(x);

  const lamps: { x: number; side: -1 | 1 }[] = [];
  for (let i = 0; i < 6; i += 1) lamps.push({ x: -44 - i * 26, side: i % 2 === 0 ? -1 : 1 });

  return (
    <group>
      {/* Dry verge under everything, so there is no void beyond the tar. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[460, 360]} />
        <meshStandardMaterial color={VERGE} roughness={1} metalness={0} />
      </mesh>

      {/* Carriageway, meeting the tarmac at the gate. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CENTER, -0.012, 0]} receiveShadow>
        <planeGeometry args={[LENGTH, ROAD_HALF_WIDTH * 2]} />
        <meshStandardMaterial color={ROAD} roughness={0.95} metalness={0.03} />
      </mesh>

      {/* Kerbs and raised pavements either side. */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh castShadow position={[CENTER, 0.05, side * (ROAD_HALF_WIDTH + 0.15)]}>
            <boxGeometry args={[LENGTH, 0.24, 0.3]} />
            <meshStandardMaterial color={KERB} roughness={0.9} metalness={0.02} />
          </mesh>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[CENTER, 0.165, side * (ROAD_HALF_WIDTH + 1.95)]}
            receiveShadow
          >
            <planeGeometry args={[LENGTH, 3.3]} />
            <meshStandardMaterial color={PAVING} roughness={0.92} metalness={0.02} />
          </mesh>
        </group>
      ))}

      {/* Lane markings: dashed centre, solid edges. */}
      {dashes.map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.004, 0]}>
          <planeGeometry args={[3, 0.16]} />
          <meshStandardMaterial color={LINE} roughness={0.8} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh
          key={`edge-${side}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[CENTER, -0.004, side * (ROAD_HALF_WIDTH - 0.6)]}
        >
          <planeGeometry args={[LENGTH, 0.14]} />
          <meshStandardMaterial color={LINE} roughness={0.8} opacity={0.8} transparent />
        </mesh>
      ))}

      <GroundLabel position={[-36, -0.002, -2.6]} text="SLOW" colour="#e9ebee" height={1.5} opacity={0.75} />

      {lamps.map((lamp) => (
        <StreetLight key={lamp.x} x={lamp.x} side={lamp.side} />
      ))}

      <BusShelter x={-86} />

      <RoadSign
        position={[-34, 0, -11.4]}
        rotationY={-Math.PI / 2}
        text="APEX PARK"
        width={3.1}
        boardColour="#14261a"
      />
      <RoadSign
        position={[-30, 0, 11.4]}
        rotationY={-Math.PI / 2}
        text="ENTRY"
        width={2.2}
        boardColour="#1e4d2b"
      />
      <RoadSign
        position={[-28.5, 0, -6.6]}
        rotationY={Math.PI / 2}
        text="EXIT"
        width={2.2}
        boardColour="#5a1f1a"
      />
    </group>
  );
}