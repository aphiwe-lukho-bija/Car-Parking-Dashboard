import { useEffect, useRef, type ReactElement } from "react";
import type * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import {
  BAY_BY_NUMBER,
  EXIT_X,
  GATE_X,
  STAGING_X,
  departurePath,
  type BaySlot,
  type VehiclePath,
} from "@shared/lotLayout";
import { CarModel } from "./CarModel";
import { measurePath, samplePath, type MeasuredPath } from "./pathSampler";
import { sceneBus, type TowPhase } from "./sceneBus";
import { useLotStore } from "../store/useLotStore";

/**
 * Where the truck joins the road. A full sixteen metres west of the exit point
 * so it fades up out of nothing while it is still a speck at the far end of the
 * street, well clear of the gate the camera is watching.
 */
const TRUCK_START_X = EXIT_X - 16;

/** Deliberately brisker than lot traffic: this leg is mostly straight road. */
const APPROACH_SPEED = 13;
const EXTRACT_SPEED = 9;
const CORNER_SPEED = 3;
const ACCELERATION = 7;
const BRAKING = 16;
/** Seconds the hook-up takes — long enough to read as work being done. */
const HOOK_SECONDS = 2.6;
/** Metres of fade at each end of the truck's and the towed car's journeys. */
const FADE_DISTANCE = 16;
/** Nose-high angle once the car's front wheels are on the lift. */
const LIFT_ANGLE = 0.055;

const TRUCK_LENGTH = 7.2;
const TRUCK_WIDTH = 2.4;
const TRUCK_HALF = TRUCK_LENGTH / 2;
const WHEEL_RADIUS = 0.52;

/**
 * The service-lane heading for a truck that has backed in nose-out, ready to
 * pull straight out with the car hanging off the lift.
 */
function laneNoseTowardAisle(bay: BaySlot): number {
  return bay.position.z < 0 ? 0 : Math.PI;
}

/** In up the road, down the aisle, and reversed into the service lane. */
function truckApproachPath(bay: BaySlot): VehiclePath {
  return {
    waypoints: [
      { x: TRUCK_START_X, y: 0, z: 0 },
      { x: STAGING_X, y: 0, z: 0 },
      { x: GATE_X, y: 0, z: 0 },
      { x: bay.position.x, y: 0, z: 0 },
      { x: bay.position.x, y: 0, z: bay.laneZ },
    ],
    headings: [
      Math.PI / 2,
      Math.PI / 2,
      Math.PI / 2,
      // Backing down the lane, nose held at the aisle the whole way in.
      laneNoseTowardAisle(bay),
    ],
  };
}

/**
 * Out with the prize. Deliberately starts at the lane centre rather than the
 * bay: the car's own departure path covers those first six metres, and because
 * the coupling sits exactly one bay-depth apart, truck and car advance by the
 * same distance along congruent routes and never drift.
 */
function truckExtractPath(bay: BaySlot): VehiclePath {
  return {
    waypoints: [
      { x: bay.position.x, y: 0, z: bay.laneZ },
      { x: bay.position.x, y: 0, z: 0 },
      { x: GATE_X, y: 0, z: 0 },
      { x: EXIT_X, y: 0, z: 0 },
    ],
    headings: [laneNoseTowardAisle(bay), -Math.PI / 2, -Math.PI / 2],
  };
}

interface DriveState {
  distance: number;
  speed: number;
}

/**
 * The same target-speed motion the fleet uses: cruise, corner limit and
 * stopping distance compete for the lowest value, and speed chases it. Kept
 * local rather than shared because the fleet's version is welded to an agent.
 */
function stepDrive(
  path: MeasuredPath,
  drive: DriveState,
  delta: number,
  cruise: number,
): void {
  const total = path.total;
  if (total <= 0) return;

  const remaining = Math.max(0, total - drive.distance);
  const lookAhead = Math.min(total, drive.distance + Math.max(4, drive.speed * 1.1));
  const sample = samplePath(path, lookAhead / total);
  const cornerLimit =
    CORNER_SPEED + (1 - Math.min(1, sample.turnRate / 0.9)) * (cruise - CORNER_SPEED);
  const stoppingLimit = Math.sqrt(2 * BRAKING * remaining);
  const target = Math.max(0.6, Math.min(cruise, cornerLimit, stoppingLimit));

  const rate = target > drive.speed ? ACCELERATION : BRAKING;
  drive.speed +=
    ((target - drive.speed) * Math.min(1, (delta * rate) / Math.max(0.5, Math.abs(target - drive.speed) + 0.5)));
  drive.distance = Math.min(total, drive.distance + drive.speed * delta);
}

function applyFade(group: THREE.Group, value: number, cache: Map<THREE.Group, number>): void {
  const opacity = Math.min(1, Math.max(0, value));
  const previous = cache.get(group);
  if (previous !== undefined && Math.abs(previous - opacity) < 0.015) return;
  cache.set(group, opacity);

  group.visible = opacity > 0.02;
  if (!group.visible) return;

  group.traverse((child) => {
    const surface = child as THREE.Mesh;
    if (surface.isMesh !== true) return;
    const list = Array.isArray(surface.material) ? surface.material : [surface.material];
    for (const material of list) {
      const standard = material as THREE.MeshStandardMaterial;
      standard.transparent = true;
      standard.opacity = opacity;
      standard.depthWrite = opacity > 0.97;
    }
  });
}

/**
 * Recovery truck: cab, deck, and a wheel-lift that folds down out of the tail.
 * Assembled from primitives like the rest of the fleet, so it costs nothing to
 * load and takes its paint from the same golden-hour materials.
 */
function TowTruck({ liftRef }: { liftRef: { current: number } }) {
  const armRef = useRef<THREE.Group>(null);
  const beaconA = useRef<THREE.MeshStandardMaterial>(null);
  const beaconB = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const lift = liftRef.current;
    if (armRef.current !== null) armRef.current.rotation.x = 1.15 * (1 - lift);

    // Rotating amber bar, not a strobe: two heads taking turns reads as a
    // beacon rather than a blink.
    const phase = clock.elapsedTime * 6;
    if (beaconA.current !== null) beaconA.current.emissiveIntensity = Math.sin(phase) > 0 ? 5 : 0.3;
    if (beaconB.current !== null) beaconB.current.emissiveIntensity = Math.sin(phase) > 0 ? 0.3 : 5;
  });

  const wheel = (x: number, z: number): ReactElement => (
    <group key={`${x}:${z}`} position={[x, WHEEL_RADIUS, z]}>
      <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, 0.3, 18]} />
        <meshStandardMaterial color="#0b0d10" roughness={0.92} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[x > 0 ? 0.08 : -0.08, 0, 0]}>
        <cylinderGeometry args={[WHEEL_RADIUS * 0.5, WHEEL_RADIUS * 0.5, 0.32, 12]} />
        <meshStandardMaterial color="#b9bec7" metalness={0.9} roughness={0.3} />
      </mesh>
    </group>
  );

  return (
    <group>
      {/* Chassis and deck. The deck sits high enough for the lift to swing. */}
      <mesh castShadow position={[0, 0.95, -0.4]}>
        <boxGeometry args={[TRUCK_WIDTH - 0.2, 0.34, TRUCK_LENGTH - 0.8]} />
        <meshStandardMaterial color="#31353c" roughness={0.7} metalness={0.4} />
      </mesh>
      <mesh castShadow position={[0, 1.18, -1.6]}>
        <boxGeometry args={[TRUCK_WIDTH - 0.35, 0.16, 3.6]} />
        <meshStandardMaterial color="#42474f" roughness={0.6} metalness={0.5} />
      </mesh>

      {/* Cab. */}
      <mesh castShadow position={[0, 1.85, 1.65]}>
        <boxGeometry args={[TRUCK_WIDTH, 1.6, 2.4]} />
        <meshStandardMaterial color="#f2f3f5" roughness={0.4} metalness={0.25} />
      </mesh>
      <mesh castShadow position={[0, 2.75, 1.65]}>
        <boxGeometry args={[TRUCK_WIDTH - 0.14, 0.3, 2.3]} />
        <meshStandardMaterial color="#e8b23a" roughness={0.5} metalness={0.2} />
      </mesh>
      {/* Windscreen and side glass. */}
      <mesh position={[0, 2.05, 2.87]}>
        <boxGeometry args={[TRUCK_WIDTH - 0.3, 0.95, 0.1]} />
        <meshStandardMaterial color="#0a0f18" roughness={0.1} metalness={0.4} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`glass-${side}`} position={[side * (TRUCK_WIDTH / 2 - 0.02), 2.05, 1.75]}>
          <boxGeometry args={[0.06, 0.8, 1.5]} />
          <meshStandardMaterial color="#0a0f18" roughness={0.12} metalness={0.4} />
        </mesh>
      ))}

      {/* Amber beacon pair along the roof line. */}
      {[-1, 1].map((side) => (
        <mesh key={`beacon-${side}`} position={[side * 0.55, 3.02, 1.65]}>
          <boxGeometry args={[0.5, 0.18, 0.34]} />
          <meshStandardMaterial
            ref={side < 0 ? beaconA : beaconB}
            color="#ffae1a"
            emissive="#ff9a00"
            emissiveIntensity={2}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Livery stripe along the cab flank. */}
      {[-1, 1].map((side) => (
        <mesh key={`stripe-${side}`} position={[side * (TRUCK_WIDTH / 2 + 0.01), 1.55, 1.65]}>
          <boxGeometry args={[0.04, 0.34, 2.36]} />
          <meshStandardMaterial color="#e8b23a" roughness={0.45} />
        </mesh>
      ))}

      {/* Head and tail lamps. */}
      {[-1, 1].map((side) => (
        <mesh key={`head-${side}`} position={[side * 0.8, 1.5, 2.86]}>
          <boxGeometry args={[0.36, 0.22, 0.08]} />
          <meshStandardMaterial color="#fff6d8" emissive="#ffe9b0" emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={`tail-${side}`} position={[side * 0.85, 1.2, -TRUCK_LENGTH / 2 + 0.1]}>
          <boxGeometry args={[0.3, 0.2, 0.08]} />
          <meshStandardMaterial color="#ff3b30" emissive="#ff2a1e" emissiveIntensity={1.6} toneMapped={false} />
        </mesh>
      ))}

      {/* Wheel-lift, hinged at the tail: folded up stowed, level when hooked. */}
      <group ref={armRef} position={[0, 1.05, -TRUCK_HALF + 0.2]}>
        <mesh castShadow position={[0, 0, -0.75]}>
          <boxGeometry args={[1.5, 0.16, 1.5]} />
          <meshStandardMaterial color="#8a9099" roughness={0.5} metalness={0.8} />
        </mesh>
        <mesh castShadow position={[0, -0.1, -1.5]}>
          <boxGeometry args={[2.1, 0.14, 0.34]} />
          <meshStandardMaterial color="#e8b23a" roughness={0.5} metalness={0.3} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={`yoke-${side}`} position={[side * 0.9, -0.28, -1.5]}>
            <boxGeometry args={[0.14, 0.4, 0.3]} />
            <meshStandardMaterial color="#5c636e" roughness={0.6} metalness={0.6} />
          </mesh>
        ))}
      </group>

      {wheel(TRUCK_WIDTH / 2 - 0.1, 2.1)}
      {wheel(-TRUCK_WIDTH / 2 + 0.1, 2.1)}
      {wheel(TRUCK_WIDTH / 2 - 0.1, -1.9)}
      {wheel(-TRUCK_WIDTH / 2 + 0.1, -1.9)}
      {wheel(TRUCK_WIDTH / 2 - 0.1, -2.75)}
      {wheel(-TRUCK_WIDTH / 2 + 0.1, -2.75)}
    </group>
  );
}

interface Run {
  bay: BaySlot;
  phase: TowPhase;
  truckPath: MeasuredPath;
  extractPath: MeasuredPath;
  carPath: MeasuredPath;
  truck: DriveState;
  car: DriveState;
  hookElapsed: number;
  lift: number;
}

/**
 * Stages an authorised removal in the scene: the truck arrives up the access
 * road, hooks the flagged vehicle in its bay, and hauls it out through the
 * gate while the camera follows.
 *
 * Everything mutates refs per frame; React only re-renders when a new tow
 * starts. The bay's own car in the fleet is suppressed for the duration (see
 * CarFleet), so this is the single copy on screen.
 */
export function TowSequence() {
  const towEvent = useLotStore((state) => state.towEvent);
  const clearTow = useLotStore((state) => state.clearTow);

  const truckRef = useRef<THREE.Group>(null);
  const carRef = useRef<THREE.Group>(null);
  const liftRef = useRef(0);
  const runRef = useRef<Run | null>(null);
  const fadeCache = useRef(new Map<THREE.Group, number>());

  // A new tow replaces whatever was running, including a stale one.
  useEffect(() => {
    if (towEvent === null) {
      runRef.current = null;
      sceneBus.tow.active = false;
      return;
    }

    const bay = BAY_BY_NUMBER.get(towEvent.spaceNumber);
    if (bay === undefined) {
      // Layout changed under us; there is nothing to animate, so settle.
      clearTow();
      return;
    }

    runRef.current = {
      bay,
      phase: "approach",
      truckPath: measurePath(truckApproachPath(bay)),
      extractPath: measurePath(truckExtractPath(bay)),
      carPath: measurePath(departurePath(bay)),
      truck: { distance: 0, speed: 0 },
      car: { distance: 0, speed: 0 },
      hookElapsed: 0,
      lift: 0,
    };

    liftRef.current = 0;
    sceneBus.tow.active = true;
    sceneBus.tow.phase = "approach";

    // Settle both subjects immediately so nothing flashes at the origin on the
    // frame the broadcast lands.
    const start = samplePath(runRef.current.truckPath, 0);
    truckRef.current?.position.set(start.x, 0, start.z);
    truckRef.current?.rotation.set(0, start.rotationY, 0);
    if (carRef.current !== null) {
      carRef.current.position.set(bay.position.x, 0, bay.position.z);
      carRef.current.rotation.set(0, bay.rotationY, 0);
    }
  }, [towEvent, clearTow]);

  useFrame((_, rawDelta) => {
    const run = runRef.current;
    const truck = truckRef.current;
    const car = carRef.current;
    if (run === null || truck === null || car === null) return;

    // Clamp so a backgrounded tab cannot jump the convoy to the gate.
    const delta = Math.min(rawDelta, 0.1);

    if (run.phase === "approach") {
      stepDrive(run.truckPath, run.truck, delta, APPROACH_SPEED);

      const t = run.truck.distance / run.truckPath.total;
      const sample = samplePath(run.truckPath, t);
      truck.position.set(sample.x, 0, sample.z);
      truck.rotation.y = sample.rotationY;

      // Still the flagged vehicle's own car at this point: parked, lit, in bay.
      car.position.set(run.bay.position.x, 0, run.bay.position.z);
      car.rotation.set(0, run.bay.rotationY, 0);
      applyFade(car, 1, fadeCache.current);
      applyFade(truck, run.truck.distance / FADE_DISTANCE, fadeCache.current);

      sceneBus.tow.x = sample.x;
      sceneBus.tow.z = sample.z;

      if (run.truck.distance >= run.truckPath.total) {
        run.phase = "hook";
        run.truck.speed = 0;
        sceneBus.tow.phase = "hook";
      }
    } else if (run.phase === "hook") {
      run.hookElapsed += delta;
      const eased = Math.min(1, run.hookElapsed / HOOK_SECONDS);
      run.lift = eased * eased * (3 - 2 * eased);
      liftRef.current = run.lift;

      const sample = samplePath(run.truckPath, 1);
      sceneBus.tow.x = sample.x;
      sceneBus.tow.z = sample.z;

      // Front wheels come up onto the cradle: nose high, tail still planted.
      car.rotation.x = -LIFT_ANGLE * run.lift;
      car.position.y = 0.05 * run.lift;

      if (run.hookElapsed >= HOOK_SECONDS) {
        run.phase = "extract";
        sceneBus.tow.phase = "extract";
      }
    } else {
      // One distance drives both: the coupling sits exactly a bay-depth apart,
      // so truck and car advance by the same amount along congruent routes.
      stepDrive(run.carPath, run.car, delta, EXTRACT_SPEED);

      const carSample = samplePath(run.carPath, run.car.distance / run.carPath.total);
      car.position.set(carSample.x, carSample.y, carSample.z);
      car.rotation.set(-LIFT_ANGLE * run.lift, carSample.rotationY, 0);
      car.position.y = 0.05 * run.lift;

      const truckDistance = Math.min(run.extractPath.total, run.car.distance);
      const truckSample = samplePath(run.extractPath, truckDistance / run.extractPath.total);
      truck.position.set(truckSample.x, 0, truckSample.z);
      truck.rotation.set(0, truckSample.rotationY, 0);

      applyFade(
        car,
        (run.carPath.total - run.car.distance) / FADE_DISTANCE,
        fadeCache.current,
      );
      applyFade(
        truck,
        (run.extractPath.total - truckDistance) / FADE_DISTANCE,
        fadeCache.current,
      );

      sceneBus.tow.x = truckSample.x;
      sceneBus.tow.z = truckSample.z;

      if (run.car.distance >= run.carPath.total) {
        runRef.current = null;
        sceneBus.tow.active = false;
        clearTow();
      }
    }
  });

  if (towEvent === null) return null;

  return (
    <group>
      <group ref={truckRef}>
        <TowTruck liftRef={liftRef} />
      </group>
      <group ref={carRef}>
        <CarModel
          vehicleType={towEvent.vehicleType}
          plate={towEvent.numberPlate}
          braking={false}
          reversing={false}
        />
      </group>
    </group>
  );
}
