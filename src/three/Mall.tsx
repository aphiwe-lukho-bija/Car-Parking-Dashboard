import { useMemo } from "react";
import { labelTexture } from "./labelTexture";

/**
 * A small two-storey retail centre, reused for both mall buildings on the site.
 *
 * One instance sits on the verge beside the north-west corner of the lot,
 * opposite the Zone A signage and fronting the access road. The other fills the
 * empty tarmac pocket inside the yard just north of the Zone A bay markings, so
 * the brown apron there reads as the shopping centre the car park serves rather
 * than leftover ground.
 *
 * The whole thing is parameterised by width and depth so the two placements can
 * differ in scale while sharing one facade, signage and material language.
 * Everything is static geometry built from primitives, so it costs nothing per
 * frame.
 */

const CONCRETE = "#d2ccc0";
const CONCRETE_DARK = "#b0a99c";
const SLAB = "#c3bcaf";
const GLASS = "#233039";
const GLASS_LIT = "#4a3718";
const METAL = "#333942";
const BRONZE = "#c9a44a";
const ROOF = "#2f343b";
const PAVING = "#a8a399";
const PAVING_DARK = "#8d887e";
const TRUNK = "#5b4632";
const LEAF = "#3f6b3a";
const HEDGE = "#33562f";
const STONE = "#c7c1b4";

const GROUND_H = 4.4;
const SLAB_H = 0.5;
const UPPER_H = 4.0;
const ROOF_Y = GROUND_H + SLAB_H + UPPER_H;

/** Evenly spaced positions across a span, used for fins, mullions and bays. */
function spread(count: number, span: number): number[] {
  const safe = Math.max(2, count);
  return Array.from(
    { length: safe },
    (_, index) => -span / 2 + (index * span) / (safe - 1),
  );
}

/** A planter: a stone trough with a clipped hedge block on top. */
function Planter({
  position,
  size = [1.6, 0.55, 1.6],
}: {
  position: [number, number, number];
  size?: [number, number, number];
}) {
  const [w, h, d] = size;
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={STONE} roughness={0.9} metalness={0.02} />
      </mesh>
      <mesh castShadow position={[0, h + 0.35, 0]}>
        <boxGeometry args={[w - 0.24, 0.7, d - 0.24]} />
        <meshStandardMaterial color={HEDGE} roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}

/** A plaza tree, matching the street trees along the boundary. */
function PlazaTree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 1.05, 0]}>
        <cylinderGeometry args={[0.1, 0.16, 2.1, 8]} />
        <meshStandardMaterial color={TRUNK} roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0, 2.45, 0]}>
        <icosahedronGeometry args={[1.05, 1]} />
        <meshStandardMaterial color={LEAF} roughness={1} flatShading />
      </mesh>
      <mesh castShadow position={[0.22, 3.1, 0.12]}>
        <icosahedronGeometry args={[0.74, 1]} />
        <meshStandardMaterial color="#4a7842" roughness={1} flatShading />
      </mesh>
    </group>
  );
}

/** A slatted bench on the forecourt. */
function Bench({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh castShadow position={[0, 0.42, -0.16]}>
        <boxGeometry args={[1.7, 0.08, 0.42]} />
        <meshStandardMaterial color="#6d5334" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 0.68, -0.32]} rotation={[0.18, 0, 0]}>
        <boxGeometry args={[1.7, 0.36, 0.07]} />
        <meshStandardMaterial color="#6d5334" roughness={0.8} />
      </mesh>
      {[-0.62, 0.62].map((x) => (
        <mesh key={x} castShadow position={[x, 0.2, -0.16]}>
          <boxGeometry args={[0.08, 0.4, 0.4]} />
          <meshStandardMaterial color={METAL} roughness={0.5} metalness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** The building itself: two glazed storeys, a projecting atrium and a living roof. */
function MallBuilding({ width, depth, name }: { width: number; depth: number; name: string }) {
  const fins = useMemo(() => spread(Math.max(4, Math.round(width / 3.2)), width - 2), [width]);
  const shops = useMemo(() => spread(Math.max(3, Math.round(width / 4.5)), width - 3), [width]);
  const pergola = useMemo(() => spread(Math.max(3, Math.round(width / 4.4)), Math.min(6, width * 0.5)), [width]);

  const upperFront = -depth / 2 + (depth - 1.4) / 2;
  const atriumW = Math.min(width * 0.42, 9);
  const canopyW = Math.min(width * 0.56, 12);
  const columnX = Math.min(canopyW / 2 - 1.2, width / 2 - 1);

  return (
    <group>
      {/* Podium and the two stacked floors, with the concrete slab bands
          projecting past the glass so the storeys read as separate volumes. */}
      <mesh receiveShadow position={[0, 0.2, -depth / 2]}>
        <boxGeometry args={[width + 1.2, 0.4, depth + 1.2]} />
        <meshStandardMaterial color={CONCRETE_DARK} roughness={0.9} />
      </mesh>

      <mesh castShadow receiveShadow position={[0, GROUND_H / 2, -depth / 2]}>
        <boxGeometry args={[width, GROUND_H, depth]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.85} metalness={0.04} />
      </mesh>

      {/* Ground-floor shopfront glass, lit from within. */}
      <mesh position={[0, 1.95, 0.06]}>
        <boxGeometry args={[width - 1.4, 2.7, 0.12]} />
        <meshStandardMaterial
          color={GLASS}
          emissive={GLASS_LIT}
          emissiveIntensity={0.55}
          roughness={0.12}
          metalness={0.5}
        />
      </mesh>
      {shops.map((x) => (
        <mesh key={`shop-${x}`} position={[x, 1.95, 0.14]}>
          <boxGeometry args={[0.14, 2.9, 0.28]} />
          <meshStandardMaterial color={METAL} roughness={0.4} metalness={0.7} />
        </mesh>
      ))}

      {/* Floor slab separation. */}
      <mesh castShadow position={[0, GROUND_H + SLAB_H / 2, -depth / 2]}>
        <boxGeometry args={[width + 0.8, SLAB_H, depth + 0.8]} />
        <meshStandardMaterial color={SLAB} roughness={0.8} metalness={0.05} />
      </mesh>

      {/* Upper storey, set back a little from the slab below. */}
      <mesh castShadow receiveShadow position={[0, GROUND_H + SLAB_H + UPPER_H / 2, -depth / 2]}>
        <boxGeometry args={[width - 1.4, UPPER_H, depth - 1.4]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.85} metalness={0.04} />
      </mesh>
      <mesh position={[0, GROUND_H + SLAB_H + UPPER_H / 2, upperFront + 0.06]}>
        <boxGeometry args={[width - 2.4, UPPER_H - 1, 0.12]} />
        <meshStandardMaterial
          color={GLASS}
          emissive={GLASS_LIT}
          emissiveIntensity={0.35}
          roughness={0.1}
          metalness={0.55}
        />
      </mesh>

      {/* Bronze mullions tying the two storeys together. */}
      {fins.map((x) => (
        <mesh key={`fin-${x}`} castShadow position={[x, ROOF_Y / 2, 0.12]}>
          <boxGeometry args={[0.18, ROOF_Y, 0.34]} />
          <meshStandardMaterial color={BRONZE} roughness={0.35} metalness={0.75} />
        </mesh>
      ))}

      {/* Roof slab, deck and parapet. */}
      <mesh castShadow position={[0, ROOF_Y + SLAB_H / 2, -depth / 2]}>
        <boxGeometry args={[width + 0.6, SLAB_H, depth + 0.6]} />
        <meshStandardMaterial color={ROOF} roughness={0.8} metalness={0.1} />
      </mesh>
      <mesh receiveShadow position={[0, ROOF_Y + SLAB_H + 0.1, -depth / 2]}>
        <boxGeometry args={[width - 0.5, 0.2, depth - 0.5]} />
        <meshStandardMaterial color={PAVING_DARK} roughness={0.95} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`par-x-${side}`} castShadow position={[side * (width / 2 - 0.1), ROOF_Y + 1, -depth / 2]}>
          <boxGeometry args={[0.3, 0.8, depth + 0.3]} />
          <meshStandardMaterial color={SLAB} roughness={0.8} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={`par-z-${side}`} castShadow position={[0, ROOF_Y + 1, -depth / 2 + side * (depth / 2 - 0.1)]}>
          <boxGeometry args={[width + 0.3, 0.8, 0.3]} />
          <meshStandardMaterial color={SLAB} roughness={0.8} />
        </mesh>
      ))}

      {/* Rooftop planters and a light pergola, visible as the camera climbs. */}
      {[-1, 1].map((side) => (
        <Planter
          key={`roof-planter-${side}`}
          position={[side * (width / 2 - 2), ROOF_Y + SLAB_H + 0.1, -depth / 2 - 4]}
          size={[2.6, 0.5, 1.4]}
        />
      ))}
      <group>
        {pergola.map((x) => (
          <mesh key={`pergola-${x}`} castShadow position={[x, ROOF_Y + SLAB_H + 2.4, -depth / 2 + 0.6]}>
            <boxGeometry args={[0.14, 0.18, 5]} />
            <meshStandardMaterial color="#6d5334" roughness={0.8} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh
            key={`pergola-post-${side}`}
            castShadow
            position={[side * Math.min(3.2, width / 3), ROOF_Y + SLAB_H + 1.2, -depth / 2 + 0.6]}
          >
            <boxGeometry args={[0.16, 2.4, 0.16]} />
            <meshStandardMaterial color="#6d5334" roughness={0.8} />
          </mesh>
        ))}
      </group>

      {/* Projecting double-height entrance atrium. */}
      <mesh castShadow position={[0, (ROOF_Y - 0.4) / 2 + 0.2, 1.1]}>
        <boxGeometry args={[atriumW, ROOF_Y - 0.4, 2.2]} />
        <meshStandardMaterial
          color={GLASS}
          emissive={GLASS_LIT}
          emissiveIntensity={0.4}
          roughness={0.08}
          metalness={0.6}
        />
      </mesh>
      {/* Bronze frame around the atrium. */}
      {[-atriumW / 2, atriumW / 2].map((x) => (
        <mesh key={`atrium-frame-${x}`} castShadow position={[x, (ROOF_Y - 0.4) / 2 + 0.2, 1.1]}>
          <boxGeometry args={[0.22, ROOF_Y - 0.2, 2.35]} />
          <meshStandardMaterial color={BRONZE} roughness={0.35} metalness={0.7} />
        </mesh>
      ))}
      <mesh castShadow position={[0, ROOF_Y - 0.2, 1.1]}>
        <boxGeometry args={[atriumW + 0.2, 0.3, 2.4]} />
        <meshStandardMaterial color={BRONZE} roughness={0.35} metalness={0.7} />
      </mesh>

      {/* Entrance canopy on two columns, with the mall name on its fascia. */}
      <mesh castShadow position={[0, GROUND_H + 1.1, 2.9]}>
        <boxGeometry args={[canopyW, 0.35, 3.4]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[0, GROUND_H + 1.1 - 0.42, 4.45]}>
        <boxGeometry args={[canopyW, 0.5, 0.24]} />
        <meshStandardMaterial color={BRONZE} roughness={0.4} metalness={0.6} />
      </mesh>
      <MallSign name={name} width={Math.min(width * 0.32, 6.6)} />
      {[-columnX, columnX].map((x) => (
        <mesh key={`canopy-col-${x}`} castShadow position={[x, (GROUND_H + 1.1) / 2, 4.1]}>
          <cylinderGeometry args={[0.14, 0.16, GROUND_H + 1.1, 12]} />
          <meshStandardMaterial color={METAL} roughness={0.4} metalness={0.7} />
        </mesh>
      ))}

      {/* Corner accent blade softening the hard edge nearest the lot. */}
      <mesh castShadow position={[width / 2 + 0.2, ROOF_Y / 2 + 0.2, -depth + 0.4]}>
        <boxGeometry args={[0.5, ROOF_Y, 0.6]} />
        <meshStandardMaterial color={BRONZE} roughness={0.4} metalness={0.65} />
      </mesh>
    </group>
  );
}

/** Illuminated mall name on the entrance fascia. */
function MallSign({ name, width }: { name: string; width: number }) {
  const texture = useMemo(() => labelTexture(name, "#f6ead0"), [name]);

  return (
    <mesh position={[0, GROUND_H + 1.1 - 0.42, 4.58]}>
      <planeGeometry args={[Math.max(2.4, width), 1.5]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

/** Landscaped forecourt linking the entrance to the pavement. */
function Forecourt({ width, depth }: { width: number; depth: number }) {
  const bollards = useMemo(() => spread(Math.max(4, Math.round(width / 2.6)), width - 2), [width]);
  const showTrees = depth >= 4;

  return (
    <group>
      {/* Paved apron reaching out to the pavement. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, depth / 2]} receiveShadow>
        <planeGeometry args={[width + 2.4, depth]} />
        <meshStandardMaterial color={PAVING} roughness={0.92} metalness={0.03} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.065, depth / 2]} receiveShadow>
        <planeGeometry args={[width + 1.6, Math.max(1, depth - 0.8)]} />
        <meshStandardMaterial color="#b3aea4" roughness={0.92} metalness={0.03} />
      </mesh>

      {/* Planter banks framing the entrance. */}
      <Planter position={[-(width / 2 - 1.4), 0.06, 1.2]} size={[2.0, 0.6, 1.8]} />
      <Planter position={[width / 2 - 1.4, 0.06, 1.2]} size={[2.0, 0.6, 1.8]} />

      {/* Shade trees either side of the doors, once the apron is deep enough. */}
      {showTrees && (
        <>
          <PlazaTree position={[-(width / 2 - 3), 0.06, depth * 0.62]} scale={1.05} />
          <PlazaTree position={[width / 2 - 3, 0.06, depth * 0.62]} scale={1.05} />
          <mesh receiveShadow position={[0, 0.16, depth - 1.2]}>
            <boxGeometry args={[Math.min(width * 0.4, 7), 0.32, 1.1]} />
            <meshStandardMaterial color={STONE} roughness={0.85} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.33, depth - 1.2]}>
            <planeGeometry args={[Math.min(width * 0.36, 6.6), 0.86]} />
            <meshStandardMaterial color="#2c4a5a" roughness={0.08} metalness={0.6} />
          </mesh>
        </>
      )}

      {/* Benches and bollards. */}
      {[-width / 4, 0, width / 4].map((x) => (
        <Bench key={`bench-${x}`} position={[x, 0.06, depth * 0.32]} />
      ))}

      {bollards.map((x) => (
        <mesh key={`bollard-${x}`} castShadow position={[x, 0.42, depth - 0.2]}>
          <cylinderGeometry args={[0.09, 0.11, 0.8, 10]} />
          <meshStandardMaterial color={METAL} roughness={0.45} metalness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

export interface RetailCentreProps {
  position: [number, number, number];
  rotationY?: number;
  width?: number;
  depth?: number;
  name?: string;
  forecourt?: number;
}

/**
 * A reusable retail centre. `position` is the centre of the front elevation, so
 * the building mass sits behind it along local -Z and the forecourt reaches out
 * along local +Z.
 */
export function RetailCentre({
  position,
  rotationY = 0,
  width = 22,
  depth = 14,
  name = "APEX MALL",
  forecourt = 5.8,
}: RetailCentreProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {forecourt > 0 && <Forecourt width={width} depth={forecourt} />}
      <MallBuilding width={width} depth={depth} name={name} />
    </group>
  );
}