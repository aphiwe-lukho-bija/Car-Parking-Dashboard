import { Suspense, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, SoftShadows } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { LOT_HALF_DEPTH, LOT_HALF_WIDTH } from "@shared/lotLayout";
import { CloudLayer, SKY, SUN_DIRECTION, SkyDome } from "./SkyDome";
import { CapeTownBackdrop } from "./CapeTownBackdrop";
import { GoldenHourEnvironment } from "./GoldenHourEnvironment";
import { CinematicPost } from "./CinematicPost";
import { LotScene } from "./LotScene";
import { CarFleet } from "./CarFleet";
import { useLotStore } from "../store/useLotStore";

/** Distance at which the climb begins and the point it aims for. */
const GROUND_MAX_DISTANCE = 96;
const ALTITUDE_MAX_DISTANCE = 470;
const LOW_ANGLE = Math.PI / 2.45;
const HIGH_ANGLE = 0.3;

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/**
 * Converts a scroll-wheel distance into a position and a viewing angle.
 *
 * Zooming out does not simply dolly backwards along a flat arc — the camera
 * climbs. Below the ground range it behaves like an orbit; past it the camera
 * lifts and steepens its look-down angle, so pulling back reads as gaining
 * altitude over the site rather than shrinking it.
 */
function altitudePose(distance: number): { height: number; polar: number } {
  const clamped = Math.min(
    1,
    Math.max(0, (distance - GROUND_MAX_DISTANCE) / (ALTITUDE_MAX_DISTANCE - GROUND_MAX_DISTANCE)),
  );

  // Rising faster than the orbit grows, because altitude is what sells it.
  const eased = smoothstep(clamped);
  return {
    height: eased * 330,
    polar: LOW_ANGLE + (HIGH_ANGLE - LOW_ANGLE) * eased,
  };
}

/**
 * Drives the camera between its ground orbit and its high-altitude pose, and
 * runs the idle drift when the operator is not interacting.
 *
 * The altitude ceiling is re-derived every frame from the controls' own
 * distance, so a scroll gesture is followed immediately while the long tail of
 * the climb eases in behind it.
 */
function CameraRig({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const lastInteraction = useRef(0);
  const { camera } = useThree();
  const ceiling = useRef(0);

  useFrame((_, delta) => {
    const controlsApi = controls.current;
    if (controlsApi === null) return;

    lastInteraction.current += delta;

    const offset = camera.position.clone().sub(controlsApi.target);
    const distance = offset.length();
    if (distance <= 0) return;

    const pose = altitudePose(distance);

    // Convert to spherical, then push the polar angle toward the pose the
    // current distance calls for. Damping the approach keeps the climb from
    // snapping when the scroll crosses the threshold.
    const spherical = new THREE.Spherical().setFromVector3(offset);

    const previousCeiling = ceiling.current;
    const desired = Math.min(spherical.phi, pose.polar);
    ceiling.current = previousCeiling === 0
      ? desired
      : previousCeiling + (desired - previousCeiling) * Math.min(1, delta * 6);

    spherical.phi = ceiling.current;
    spherical.makeSafe();
    camera.position.copy(controlsApi.target).add(new THREE.Vector3().setFromSpherical(spherical));

    // Resume the drift 6s after the operator stops dragging.
    if (lastInteraction.current > 6) {
      const angle = delta * 0.045;
      const driftOffset = camera.position.clone().sub(controlsApi.target);
      driftOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      camera.position.copy(controlsApi.target).add(driftOffset);
    }

    controlsApi.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.06}
      minDistance={26}
      maxDistance={ALTITUDE_MAX_DISTANCE}
      minPolarAngle={0.06}
      maxPolarAngle={LOW_ANGLE}
      target={[0, 0, 0]}
      onStart={() => {
        lastInteraction.current = 0;
      }}
    />
  );
}

/** Keeps the sun's shadow frustum tight around the lot for crisp shadows. */
function SunLight({ span }: { span: number }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const { camera } = useThree();
  const appliedSpan = useRef(0);

  useFrame(() => {
    const current = light.current;
    if (current === null) return;

    // The default target is the world origin but is not part of the scene
    // graph, so it has to be positioned explicitly before the shadow camera
    // reads it. Without this the shadows slide as the camera climbs.
    const target = current.target;
    if (target === undefined || target === null) return;
    target.position.set(0, 0, 0);
    target.updateMatrixWorld();

    // The frustum follows the zoom instead of being fixed. Pulled in close for a
    // plate close-up the 2048 map is spent on a few metres of tarmac and the
    // shadows stay sharp; at altitude it widens so the whole site still casts.
    const distance = camera.position.length();
    const desired = THREE.MathUtils.clamp(distance * 0.62, span * 0.55, span * 2.4);

    // Rebuilding the projection every frame is wasted work, and re-fitting it
    // for sub-pixel changes causes visible shadow shimmer while dragging.
    if (Math.abs(desired - appliedSpan.current) < appliedSpan.current * 0.04 + 0.5) return;
    appliedSpan.current = desired;

    const shadowCamera = current.shadow.camera;
    shadowCamera.left = -desired;
    shadowCamera.right = desired;
    shadowCamera.top = desired;
    shadowCamera.bottom = -desired;
    shadowCamera.updateProjectionMatrix();
  });

  return (
    <directionalLight
      ref={light}
      position={SUN_DIRECTION.clone().multiplyScalar(180).toArray()}
      intensity={2.5}
      color="#ffe0b0"
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-span}
      shadow-camera-right={span}
      shadow-camera-top={span}
      shadow-camera-bottom={-span}
      shadow-camera-near={20}
      shadow-camera-far={420}
      shadow-bias={-0.0006}
      shadow-normalBias={0.02}
    />
  );
}

export function ParkingLot() {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const visualQuality = useLotStore((state) => state.visualQuality);

  const cameraSpan = Math.max(LOT_HALF_WIDTH, LOT_HALF_DEPTH);

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        // Handed to the postprocessing ToneMapping effect, which tone maps the
        // whole frame once the composer has resolved bloom and occlusion.
        toneMapping: THREE.NoToneMapping,
      }}
      camera={{
        position: [-cameraSpan * 1.15, cameraSpan * 1.05, cameraSpan * 1.25],
        fov: 42,
        near: 0.5,
        far: 6000,
      }}
    >
      <SkyDome />

      {/* Light haze only. Heavy fog would grey out the mountain and turn the
          altitude climb into a white-out. */}
      <fog attach="fog" args={[SKY.haze, 900, 3400]} />

      {/* Reflections for every clearcoat surface in the lot. Captured once and
          offline from the same palette the visible sky reads from.

          Held at zero because the environment probe washed the paint out to a
          uniform sheen that read as plastic. The materials keep their clearcoat
          and envMapIntensity, so raising this single number restores real
          reflections without touching any other value. */}
      <GoldenHourEnvironment intensity={0} />

      {/* Golden hour: warm sky bounce, cool shadow fill from the tarmac, and a
          low sun that throws long shadows down the aisles. */}
      <hemisphereLight args={[SKY.horizon, SKY.ground, 1.5]} />
      <ambientLight intensity={0.5} color="#cfd8e8" />
      <SunLight span={cameraSpan * 1.6} />
      {/* Cool fill from the opposite side so shadowed flanks are not black. */}
      <directionalLight position={[40, 26, 50]} intensity={0.55} color="#a8c4ee" />

      <Suspense fallback={null}>
        <SoftShadows size={22} samples={9} focus={0.6} />
        <CapeTownBackdrop />
        <CloudLayer altitude={620} seed={3} opacity={0.5} drift={0.0011} tint="#fff2df" />
        <CloudLayer altitude={330} seed={11} opacity={0.72} drift={0.0021} tint="#fff8ee" />
        <LotScene />
        <CarFleet />
      </Suspense>

      <CameraRig controls={controls} />

      <CinematicPost quality={visualQuality} />
    </Canvas>
  );
}