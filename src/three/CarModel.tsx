import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { VehicleType } from "@shared/types";
import {
  VEHICLE_DIMENSIONS,
  paintFor,
  type VehicleDimensions,
} from "./vehicleSpecs";

/**
 * Shared primitive geometry for the whole fleet.
 *
 * Every vehicle is assembled from unit boxes and cylinders and then scaled into
 * shape. Three.js uploads each geometry to the GPU once, so a lot of forty-odd
 * cars costs a handful of buffers instead of hundreds: without this, each of
 * the ~20 parts per car was a fresh BufferGeometry, which is both upload work
 * when a car drives on and steady memory pressure on the GPU.
 */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_WHEEL = new THREE.CylinderGeometry(1, 1, 1, 20);
const UNIT_RIM = new THREE.CylinderGeometry(1, 1, 1, 14);
const UNIT_FORK = new THREE.CylinderGeometry(1, 1, 1, 8);

/**
 * Materials stay per vehicle, because the scene fades a car in and out by
 * writing to its materials, and shared materials would make one car's fade
 * bleed into every other car of the same colour. They are built from the same
 * handful of shapes, so the GPU shader program is still shared; only the small
 * per-instance uniforms differ. Each one is disposed when the car unmounts so a
 * long demo does not leak a material for every vehicle that ever parked.
 */
function useBodyMaterial(colour: string): THREE.MeshPhysicalMaterial {
  const material = useMemo(
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
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

function useGlassMaterial(): THREE.MeshPhysicalMaterial {
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#0a0f18",
        metalness: 0.15,
        roughness: 0.06,
        reflectivity: 0.9,
        envMapIntensity: 2.1,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

function useRubberMaterial(): THREE.MeshStandardMaterial {
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#0b0d10", roughness: 0.92, metalness: 0 }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

function useRimMaterial(): THREE.MeshStandardMaterial {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#c9ced6",
        roughness: 0.24,
        metalness: 0.95,
        envMapIntensity: 1.6,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

/**
 * A lamp whose brightness is driven by state.
 *
 * The material is keyed on both its colour and its intensity, and the previous
 * one is disposed when either changes. That keeps the shader program shared
 * across the fleet while letting brake and reverse lamps switch on and off
 * without mutating a material that React already owns.
 */
function useLampMaterial(colour: string, intensity: number): THREE.MeshStandardMaterial {
  const material = useMemo(
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
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

function Wheel({
  position,
  radius,
  tyre,
  rimMaterial,
}: {
  position: [number, number, number];
  radius: number;
  tyre: THREE.Material;
  rimMaterial: THREE.Material;
}) {
  // A unit cylinder scaled into shape: the tyre's radius and the rim's smaller
  // diameter are both handled by the mesh scale rather than new geometry.
  return (
    <group position={position}>
      <mesh
        castShadow
        material={tyre}
        geometry={UNIT_WHEEL}
        rotation={[0, 0, Math.PI / 2]}
        scale={[radius, 0.22, radius]}
      />
      <mesh
        material={rimMaterial}
        geometry={UNIT_RIM}
        rotation={[0, 0, Math.PI / 2]}
        position={[0.055, 0, 0]}
        scale={[radius * 0.55, 0.235, radius * 0.55]}
      />
    </group>
  );
}

function Motorbike({
  dimensions,
  body,
  rubber,
  headlight,
  taillight,
}: {
  dimensions: VehicleDimensions;
  body: THREE.Material;
  rubber: THREE.Material;
  headlight: THREE.Material;
  taillight: THREE.Material;
}) {
  const { length, width, wheelRadius } = dimensions;

  return (
    <group>
      <mesh
        castShadow
        material={body}
        geometry={UNIT_BOX}
        position={[0, wheelRadius + 0.34, 0]}
        scale={[0.34, 0.3, length * 0.62]}
      />
      <mesh
        castShadow
        material={body}
        geometry={UNIT_BOX}
        position={[0, wheelRadius + 0.62, 0.22]}
        scale={[0.28, 0.42, 0.52]}
      />
      <mesh
        castShadow
        material={body}
        geometry={UNIT_BOX}
        position={[0, wheelRadius + 0.5, -0.62]}
        scale={[0.3, 0.16, 0.42]}
      />
      <mesh
        material={headlight}
        geometry={UNIT_BOX}
        position={[0, wheelRadius + 0.72, length * 0.29]}
        scale={[0.22, 0.12, 0.06]}
      />
      <mesh
        material={taillight}
        geometry={UNIT_BOX}
        position={[0, wheelRadius + 0.6, -length * 0.3]}
        scale={[0.2, 0.08, 0.05]}
      />
      <Wheel position={[0, wheelRadius, length * 0.32]} radius={wheelRadius} tyre={rubber} rimMaterial={rubber} />
      <Wheel position={[0, wheelRadius, -length * 0.32]} radius={wheelRadius} tyre={rubber} rimMaterial={rubber} />
      <mesh
        castShadow
        material={rubber}
        geometry={UNIT_FORK}
        position={[width * 0.3, wheelRadius + 0.62, -0.2]}
        rotation={[0, 0, 0.12]}
        scale={[0.035, 1.05, 0.035]}
      />
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
        body={body}
        rubber={rubber}
        headlight={headlight}
        taillight={taillight}
      />
    );
  }

  return (
    <group>
      {/* Main body */}
      <mesh
        castShadow
        receiveShadow
        material={body}
        geometry={UNIT_BOX}
        position={[0, bodyY, 0]}
        scale={[width, bodyHeight, length]}
      />

      {/* Lower valance, slightly narrower, to break up the slab silhouette */}
      <mesh
        castShadow
        material={body}
        geometry={UNIT_BOX}
        position={[0, wheelRadius + 0.16, 0]}
        scale={[width * 0.96, 0.3, length * 0.94]}
      />

      {/* Greenhouse */}
      <mesh
        castShadow
        material={glass}
        geometry={UNIT_BOX}
        position={[0, height - dimensions.cabinHeight * 0.5 + 0.04, dimensions.cabinOffsetZ]}
        scale={[width * 0.88, dimensions.cabinHeight, dimensions.cabinLength]}
      />

      {/* Roof panel caps the glass box so it reads as a solid roof */}
      <mesh
        castShadow
        material={body}
        geometry={UNIT_BOX}
        position={[0, height + 0.015, dimensions.cabinOffsetZ]}
        scale={[width * 0.84, 0.06, dimensions.cabinLength * 0.96]}
      />

      {/* Bonnet and boot creases */}
      <mesh
        material={body}
        geometry={UNIT_BOX}
        position={[0, bodyY + bodyHeight * 0.5 - 0.01, length * 0.32]}
        scale={[width * 0.86, 0.05, length * 0.2]}
      />
      <mesh
        material={body}
        geometry={UNIT_BOX}
        position={[0, bodyY + bodyHeight * 0.5 - 0.01, -length * 0.34]}
        scale={[width * 0.86, 0.05, length * 0.16]}
      />

      {/* Side mirrors */}
      <mesh
        material={body}
        geometry={UNIT_BOX}
        position={[width * 0.55, height * 0.72, length * 0.16]}
        scale={[0.14, 0.09, 0.2]}
      />
      <mesh
        material={body}
        geometry={UNIT_BOX}
        position={[-width * 0.55, height * 0.72, length * 0.16]}
        scale={[0.14, 0.09, 0.2]}
      />

      {/* Lights */}
      <mesh
        material={headlight}
        geometry={UNIT_BOX}
        position={[width * 0.3, bodyY + bodyHeight * 0.16, length * 0.5]}
        scale={[0.34, 0.12, 0.05]}
      />
      <mesh
        material={headlight}
        geometry={UNIT_BOX}
        position={[-width * 0.3, bodyY + bodyHeight * 0.16, length * 0.5]}
        scale={[0.34, 0.12, 0.05]}
      />
      <mesh
        material={taillight}
        geometry={UNIT_BOX}
        position={[width * 0.32, bodyY + bodyHeight * 0.18, -length * 0.5]}
        scale={[0.32, 0.1, 0.05]}
      />
      <mesh
        material={taillight}
        geometry={UNIT_BOX}
        position={[-width * 0.32, bodyY + bodyHeight * 0.18, -length * 0.5]}
        scale={[0.32, 0.1, 0.05]}
      />

      {/* Reverse lamps, inboard of the tail lights as on a real car. */}
      <mesh
        material={reverse}
        geometry={UNIT_BOX}
        position={[width * 0.16, bodyY + bodyHeight * 0.17, -length * 0.5]}
        scale={[0.14, 0.08, 0.04]}
      />
      <mesh
        material={reverse}
        geometry={UNIT_BOX}
        position={[-width * 0.16, bodyY + bodyHeight * 0.17, -length * 0.5]}
        scale={[0.14, 0.08, 0.04]}
      />

      <Wheel position={[width * 0.5, wheelRadius, axleZ]} radius={wheelRadius} tyre={rubber} rimMaterial={rim} />
      <Wheel position={[-width * 0.5, wheelRadius, axleZ]} radius={wheelRadius} tyre={rubber} rimMaterial={rim} />
      <Wheel position={[width * 0.5, wheelRadius, -axleZ]} radius={wheelRadius} tyre={rubber} rimMaterial={rim} />
      <Wheel position={[-width * 0.5, wheelRadius, -axleZ]} radius={wheelRadius} tyre={rubber} rimMaterial={rim} />
    </group>
  );
}