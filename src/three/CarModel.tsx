import { useMemo } from "react";
import * as THREE from "three";
import type { VehicleType } from "@shared/types";
import {
  VEHICLE_DIMENSIONS,
  paintFor,
  type VehicleDimensions,
} from "./vehicleSpecs";

function useBodyMaterial(colour: string): THREE.MeshPhysicalMaterial {
  return useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: colour,
        metalness: 0.62,
        roughness: 0.28,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        envMapIntensity: 1.35,
      }),
    [colour],
  );
}

function useGlassMaterial(): THREE.MeshPhysicalMaterial {
  return useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#0a0f18",
        metalness: 0.15,
        roughness: 0.06,
        transmission: 0,
        reflectivity: 0.9,
        envMapIntensity: 2.1,
      }),
    [],
  );
}

function useRubberMaterial(): THREE.MeshStandardMaterial {
  return useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#0b0d10", roughness: 0.92, metalness: 0 }),
    [],
  );
}

function useRimMaterial(): THREE.MeshStandardMaterial {
  return useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#c9ced6",
        roughness: 0.24,
        metalness: 0.95,
        envMapIntensity: 1.6,
      }),
    [],
  );
}

function useLampMaterial(colour: string, intensity: number): THREE.MeshStandardMaterial {
  return useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: colour,
        emissive: colour,
        emissiveIntensity: intensity,
        roughness: 0.3,
        toneMapped: false,
      }),
    [colour, intensity],
  );
}

function Wheel({
  position,
  radius,
  rubber,
  rim,
}: {
  position: [number, number, number];
  radius: number;
  rubber: THREE.Material;
  rim: THREE.Material;
}) {
  return (
    <group position={position}>
      <mesh castShadow material={rubber} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius, radius, 0.22, 20]} />
      </mesh>
      <mesh material={rim} rotation={[0, 0, Math.PI / 2]} position={[0.055, 0, 0]}>
        <cylinderGeometry args={[radius * 0.55, radius * 0.55, 0.235, 14]} />
      </mesh>
    </group>
  );
}

function Motorbike({
  dimensions,
  paint,
  rubber,
  headlight,
  taillight,
}: {
  dimensions: VehicleDimensions;
  paint: THREE.Material;
  rubber: THREE.Material;
  headlight: THREE.Material;
  taillight: THREE.Material;
}) {
  const { length, width, wheelRadius } = dimensions;

  return (
    <group>
      <mesh castShadow material={paint} position={[0, wheelRadius + 0.34, 0]}>
        <boxGeometry args={[0.34, 0.3, length * 0.62]} />
      </mesh>
      <mesh castShadow material={paint} position={[0, wheelRadius + 0.62, 0.22]}>
        <boxGeometry args={[0.28, 0.42, 0.52]} />
      </mesh>
      <mesh castShadow material={paint} position={[0, wheelRadius + 0.5, -0.62]}>
        <boxGeometry args={[0.3, 0.16, 0.42]} />
      </mesh>
      <mesh material={headlight} position={[0, wheelRadius + 0.72, length * 0.29]}>
        <boxGeometry args={[0.22, 0.12, 0.06]} />
      </mesh>
      <mesh material={taillight} position={[0, wheelRadius + 0.6, -length * 0.3]}>
        <boxGeometry args={[0.2, 0.08, 0.05]} />
      </mesh>
      <Wheel position={[0, wheelRadius, length * 0.32]} radius={wheelRadius} rubber={rubber} rim={rubber} />
      <Wheel position={[0, wheelRadius, -length * 0.32]} radius={wheelRadius} rubber={rubber} rim={rubber} />
      <mesh castShadow position={[width * 0.3, wheelRadius + 0.62, -0.2]} rotation={[0, 0, 0.12]}>
        <cylinderGeometry args={[0.035, 0.035, 1.05, 8]} />
        <meshStandardMaterial color="#8a9099" metalness={0.9} roughness={0.3} />
      </mesh>
    </group>
  );
}

/**
 * A procedurally assembled vehicle.
 *
 * Built from primitives rather than a glTF so the whole fleet costs a few
 * kilobytes of geometry instead of megabytes, and so every vehicle can be
 * tinted and re-proportioned at runtime from the database record.
 */
export function CarModel({
  vehicleType,
  plate,
  lightsOn = true,
  braking = false,
  reversing = false,
}: {
  vehicleType: VehicleType;
  plate: string;
  lightsOn?: boolean;
  /** Brake lights lit while the vehicle decelerates into its bay. */
  braking?: boolean;
  /** Reverse lamps lit while manoeuvring backwards. */
  reversing?: boolean;
}) {
  const dimensions = VEHICLE_DIMENSIONS[vehicleType];

  const body = useBodyMaterial(paintFor(plate));
  const glass = useGlassMaterial();
  const rubber = useRubberMaterial();
  const rim = useRimMaterial();
  const headlight = useLampMaterial("#fff4d6", lightsOn ? 2.4 : 0.35);
  // Braking roughly triples the tail-lamp output; reverse lamps are a separate,
  // cooler lamp so the two states stay distinguishable from behind.
  const taillight = useLampMaterial("#ff2b45", braking ? 4.2 : lightsOn ? 1.6 : 0.3);
  const reverse = useLampMaterial("#f4f6ff", reversing ? 3.2 : 0.06);

  const { length, width, height, wheelRadius } = dimensions;
  const bodyHeight = height * 0.62;
  const bodyY = wheelRadius + bodyHeight * 0.42;

  const axleZ = length * 0.32;

  if (vehicleType === "motorbike") {
    return (
      <Motorbike
        dimensions={dimensions}
        paint={body}
        rubber={rubber}
        headlight={headlight}
        taillight={taillight}
      />
    );
  }

  return (
    <group>
      {/* Main body */}
      <mesh castShadow receiveShadow material={body} position={[0, bodyY, 0]}>
        <boxGeometry args={[width, bodyHeight, length]} />
      </mesh>

      {/* Lower valance, slightly narrower, to break up the slab silhouette */}
      <mesh castShadow material={body} position={[0, wheelRadius + 0.16, 0]}>
        <boxGeometry args={[width * 0.96, 0.3, length * 0.94]} />
      </mesh>

      {/* Greenhouse */}
      <mesh castShadow material={glass} position={[0, height - dimensions.cabinHeight * 0.5 + 0.04, dimensions.cabinOffsetZ]}>
        <boxGeometry
          args={[width * 0.88, dimensions.cabinHeight, dimensions.cabinLength]}
        />
      </mesh>

      {/* Roof panel caps the glass box so it reads as a solid roof */}
      <mesh castShadow material={body} position={[0, height + 0.015, dimensions.cabinOffsetZ]}>
        <boxGeometry args={[width * 0.84, 0.06, dimensions.cabinLength * 0.96]} />
      </mesh>

      {/* Bonnet and boot creases */}
      <mesh material={body} position={[0, bodyY + bodyHeight * 0.5 - 0.01, length * 0.32]}>
        <boxGeometry args={[width * 0.86, 0.05, length * 0.2]} />
      </mesh>
      <mesh material={body} position={[0, bodyY + bodyHeight * 0.5 - 0.01, -length * 0.34]}>
        <boxGeometry args={[width * 0.86, 0.05, length * 0.16]} />
      </mesh>

      {/* Side mirrors */}
      <mesh material={body} position={[width * 0.55, height * 0.72, length * 0.16]}>
        <boxGeometry args={[0.14, 0.09, 0.2]} />
      </mesh>
      <mesh material={body} position={[-width * 0.55, height * 0.72, length * 0.16]}>
        <boxGeometry args={[0.14, 0.09, 0.2]} />
      </mesh>

      {/* Lights */}
      <mesh material={headlight} position={[width * 0.3, bodyY + bodyHeight * 0.16, length * 0.5]}>
        <boxGeometry args={[0.34, 0.12, 0.05]} />
      </mesh>
      <mesh material={headlight} position={[-width * 0.3, bodyY + bodyHeight * 0.16, length * 0.5]}>
        <boxGeometry args={[0.34, 0.12, 0.05]} />
      </mesh>
      <mesh material={taillight} position={[width * 0.32, bodyY + bodyHeight * 0.18, -length * 0.5]}>
        <boxGeometry args={[0.32, 0.1, 0.05]} />
      </mesh>
      <mesh material={taillight} position={[-width * 0.32, bodyY + bodyHeight * 0.18, -length * 0.5]}>
        <boxGeometry args={[0.32, 0.1, 0.05]} />
      </mesh>

      {/* Reverse lamps, inboard of the tail lights as on a real car. */}
      <mesh material={reverse} position={[width * 0.16, bodyY + bodyHeight * 0.17, -length * 0.5]}>
        <boxGeometry args={[0.14, 0.08, 0.04]} />
      </mesh>
      <mesh material={reverse} position={[-width * 0.16, bodyY + bodyHeight * 0.17, -length * 0.5]}>
        <boxGeometry args={[0.14, 0.08, 0.04]} />
      </mesh>

      <Wheel position={[width * 0.5, wheelRadius, axleZ]} radius={wheelRadius} rubber={rubber} rim={rim} />
      <Wheel position={[-width * 0.5, wheelRadius, axleZ]} radius={wheelRadius} rubber={rubber} rim={rim} />
      <Wheel position={[width * 0.5, wheelRadius, -axleZ]} radius={wheelRadius} rubber={rubber} rim={rim} />
      <Wheel position={[-width * 0.5, wheelRadius, -axleZ]} radius={wheelRadius} rubber={rubber} rim={rim} />
    </group>
  );
}
