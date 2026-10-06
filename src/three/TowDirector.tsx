import { useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { GATE_X } from "@shared/lotLayout";
import { sceneBus, type TowPhase } from "./sceneBus";
import { useLotStore } from "../store/useLotStore";

const smoothstep = (t: number): number => t * t * (3 - 2 * t);
const RETURN_SECONDS = 2.6;

interface Shot {
  position: THREE.Vector3;
  target: THREE.Vector3;
  /** How hard the camera pushes toward the shot; higher reads as a cut. */
  stiffness: number;
}

const approachRoad = new THREE.Vector3(GATE_X - 30, 7, 18);
const approachInside = new THREE.Vector3(17, 10.5, 19);
const hookShot = new THREE.Vector3(11, 5.5, 11);
const extractShot = new THREE.Vector3(9, 9.5, 18);

/**
 * Owns the camera for the length of a tow.
 *
 * The moment an enforcement broadcast lands it takes the operator's current
 * pose, raises the lock the orbit rig watches for, and frames the removal shot
 * by shot — the truck coming up the road, moving in for the hook-up, then
 * trailing the convoy out through the gate. When the lot is clear it glides
 * back to the exact position it was handed and releases the lock, so the orbit
 * rig picks up the same view it left behind and nothing else on the dashboard
 * moves.
 *
 * It drives the camera directly rather than through the controls: the target
 * is deliberately left untouched, which is what lets the rig resume without
 * any snapping when the lock drops.
 */
export function TowDirector() {
  const { camera } = useThree();
  const towEvent = useLotStore((state) => state.towEvent);
  const cameraMode = useLotStore((state) => state.cameraMode);

  const saved = useRef<{ position: THREE.Vector3; quaternion: THREE.Quaternion } | null>(null);
  const returning = useRef<{
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    elapsed: number;
  } | null>(null);
  const phase = useRef<TowPhase | null>(null);
  const subject = useRef(new THREE.Vector3());
  const scratch = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);

    // In free mode the operator owns the camera outright: no scripted shot,
    // and make sure any lock left over from a previous tow is released.
    if (cameraMode === "free") {
      if (useLotStore.getState().cameraLocked) useLotStore.getState().setCameraLocked(false);
      saved.current = null;
      returning.current = null;
      phase.current = null;
      return;
    }

    const active = towEvent !== null && sceneBus.tow.active;

    if (active) {
      const fresh = saved.current === null;
      if (fresh) {
        saved.current = {
          position: camera.position.clone(),
          quaternion: camera.quaternion.clone(),
        };
        returning.current = null;
        phase.current = null;
        useLotStore.getState().setCameraLocked(true);
      }

      const shotPhase = sceneBus.tow.phase;
      const cut = phase.current !== null && phase.current !== shotPhase;
      phase.current = shotPhase;

      // Tight on the subject: it is the one thing worth following. Snapped on
      // the first frame so the camera does not swing in from the origin.
      scratch.current.set(sceneBus.tow.x, 1.4, sceneBus.tow.z);
      if (fresh) {
        subject.current.copy(scratch.current);
        look.current.copy(scratch.current);
      } else {
        subject.current.lerp(scratch.current, 1 - Math.exp(-6 * delta));
      }

      let shot: Shot;
      if (shotPhase === "approach" && sceneBus.tow.x < GATE_X) {
        // Static roadside vantage: the truck drives into the frame.
        shot = { position: approachRoad, target: subject.current, stiffness: 1.7 };
      } else if (shotPhase === "approach") {
        shot = {
          position: scratch.current.copy(subject.current).add(approachInside),
          target: subject.current,
          stiffness: 2.1,
        };
      } else if (shotPhase === "hook") {
        shot = {
          position: scratch.current.copy(subject.current).add(hookShot),
          target: subject.current,
          stiffness: 3.4,
        };
      } else {
        // Trailing the convoy so the car on the lift stays in shot as it goes.
        shot = {
          position: scratch.current.copy(subject.current).add(extractShot),
          target: subject.current,
          stiffness: 1.9,
        };
      }

      // A phase change tightens the pursuit instead of gliding between shots.
      const rate = cut ? shot.stiffness * 2.2 : shot.stiffness;
      const blend = 1 - Math.exp(-rate * delta);
      camera.position.lerp(shot.position, blend);
      camera.lookAt(look.current.lerp(shot.target, blend));
      return;
    }

    if (saved.current === null) return;

    // Tow over: hand the view back exactly as it was found. Position and
    // orientation both, so the orbit rig resumes without a snap.
    if (returning.current === null) {
      returning.current = {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
        elapsed: 0,
      };
    }

    returning.current.elapsed += delta;
    const t = smoothstep(Math.min(1, returning.current.elapsed / RETURN_SECONDS));
    camera.position.lerpVectors(returning.current.position, saved.current.position, t);
    camera.quaternion.slerpQuaternions(
      returning.current.quaternion,
      saved.current.quaternion,
      t,
    );

    if (t >= 1) {
      useLotStore.getState().setCameraLocked(false);
      saved.current = null;
      returning.current = null;
      phase.current = null;
    }
  });

  return null;
}