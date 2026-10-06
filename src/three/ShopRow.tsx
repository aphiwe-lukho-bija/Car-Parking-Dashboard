import { useMemo } from "react";
import { labelTexture } from "./labelTexture";

/**
 * A packed terrace of two-storey shop units.
 *
 * The interior retail block (`RetailCentre`) anchors the corner; this is the
 * cheap repeatable unit that fills the ground beside it wall-to-wall, so the
 * margin behind the motorbike row and along the east fence reads as a small
 * shopping street rather than empty tarmac. The mass, glazing and bronze
 * details are the same language as the mall, just reduced to one shopfront.
 *
 * Every unit is static primitives, and the terrace is laid out on a single
 * line, so a run of shops costs one pass of simple meshes and no per-frame work.
 */

const CONCRETE = "#cfc9bd";
const CONCRETE_DARK = "#b7b0a3";
const SLAB = "#bdb6a9";
const GLASS = "#22303a";
const GLASS_LIT = "#4a3718";
const BRONZE = "#c9a44a";
const METAL = "#333942";
const ROOF = "#2f343b";

const GROUND = 3.8;
const SLAB_H = 0.4;
const UPPER = 3.0;
const ROOF_Y = GROUND + SLAB_H + UPPER;

/** A single shopfront: two storeys, a lit ground-floor window and a fascia sign. */
function ShopUnit({
  width,
  depth,
  name,
}: {
  width: number;
  depth: number;
  name: string;
}) {
  const sign = useMemo(() => labelTexture(name, "#f6ead0"), [name]);
  const upperFront = -0.3;

  return (
    <group>
      <mesh receiveShadow position={[0, 0.15, -depth / 2]}>
        <boxGeometry args={[width + 0.4, 0.3, depth + 0.4]} />
        <meshStandardMaterial color={CONCRETE_DARK} roughness={0.9} />
      </mesh>

      {/* Ground storey. */}
      <mesh castShadow receiveShadow position={[0, GROUND / 2, -depth / 2]}>
        <boxGeometry args={[width, GROUND, depth]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.85} metalness={0.04} />
      </mesh>

      {/* Lit shopfront glazing. */}
      <mesh position={[0, 1.75, 0.03]}>
        <boxGeometry args={[width - 0.8, 2.5, 0.12]} />
        <meshStandardMaterial
          color={GLASS}
          emissive={GLASS_LIT}
          emissiveIntensity={0.55}
          roughness={0.12}
          metalness={0.5}
        />
      </mesh>

      {/* Mullions framing the window. */}
      {[-1, 0, 1].map((side) => (
        <mesh
          key={`mullion-${side}`}
          castShadow
          position={[side * (width / 2 - 0.1), GROUND / 2, 0.08]}
        >
          <boxGeometry args={[0.16, GROUND, 0.28]} />
          <meshStandardMaterial color={METAL} roughness={0.4} metalness={0.7} />
        </mesh>
      ))}

      {/* Floor slab separation. */}
      <mesh castShadow position={[0, GROUND + SLAB_H / 2, -depth / 2]}>
        <boxGeometry args={[width + 0.4, SLAB_H, depth + 0.4]} />
        <meshStandardMaterial color={SLAB} roughness={0.8} metalness={0.05} />
      </mesh>

      {/* Upper storey, set back from the slab below. */}
      <mesh castShadow receiveShadow position={[0, GROUND + SLAB_H + UPPER / 2, -depth / 2]}>
        <boxGeometry args={[width - 0.6, UPPER, depth - 0.6]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.85} metalness={0.04} />
      </mesh>
      <mesh position={[0, GROUND + SLAB_H + UPPER / 2, upperFront + 0.03]}>
        <boxGeometry args={[width - 1.4, UPPER - 0.9, 0.12]} />
        <meshStandardMaterial
          color={GLASS}
          emissive={GLASS_LIT}
          emissiveIntensity={0.35}
          roughness={0.1}
          metalness={0.55}
        />
      </mesh>

      {/* Bronze fascia band and the shop name. */}
      <mesh castShadow position={[0, GROUND - 0.5, 0.14]}>
        <boxGeometry args={[width - 0.5, 0.76, 0.22]} />
        <meshStandardMaterial color={BRONZE} roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, GROUND - 0.5, 0.27]}>
        <planeGeometry args={[Math.max(1.4, width - 1.6), 0.58]} />
        <meshBasicMaterial map={sign} transparent toneMapped={false} />
      </mesh>

      {/* Corner pilasters carrying the facade. */}
      {[-1, 1].map((side) => (
        <mesh
          key={`pilaster-${side}`}
          castShadow
          position={[side * (width / 2 - 0.08), ROOF_Y / 2, 0.04]}
        >
          <boxGeometry args={[0.26, ROOF_Y, 0.26]} />
          <meshStandardMaterial color={BRONZE} roughness={0.4} metalness={0.65} />
        </mesh>
      ))}

      {/* Roof slab and parapet. */}
      <mesh castShadow position={[0, ROOF_Y + 0.17, -depth / 2]}>
        <boxGeometry args={[width + 0.3, 0.34, depth + 0.3]} />
        <meshStandardMaterial color={ROOF} roughness={0.8} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[0, ROOF_Y + 0.55, 0.05]}>
        <boxGeometry args={[width + 0.3, 0.7, 0.22]} />
        <meshStandardMaterial color={SLAB} roughness={0.8} />
      </mesh>
    </group>
  );
}

export interface ShopRowProps {
  /** Where the row's local origin sits in world space. */
  position: [number, number, number];
  rotationY?: number;
  /** Local-space extent of the row (along local x). */
  start: number;
  end: number;
  /** How deep each unit runs behind its frontage. */
  depth: number;
  /** Number of units packed wall-to-wall across the span. */
  count: number;
  /** Sign text prefix; each unit is suffixed with its number. */
  name: string;
  /** First unit number, so numbering can continue across rows. */
  startIndex?: number;
}

/** A wall-to-wall run of shop units along local x, facing local +z. */
export function ShopRow({
  position,
  rotationY = 0,
  start,
  end,
  depth,
  count,
  name,
  startIndex = 1,
}: ShopRowProps) {
  const unitWidth = (end - start) / count;
  const centres = useMemo(
    () => Array.from({ length: count }, (_, index) => start + unitWidth * (index + 0.5)),
    [start, count, unitWidth],
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {centres.map((x, index) => (
        <group key={`${name}-${index}`} position={[x, 0, 0]}>
          <ShopUnit
            width={unitWidth}
            depth={depth}
            name={`${name} ${String(startIndex + index).padStart(2, "0")}`}
          />
        </group>
      ))}
    </group>
  );
}