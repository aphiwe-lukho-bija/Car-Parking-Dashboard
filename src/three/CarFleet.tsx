import { useCallback, useRef, useState } from "react";
import type { Group } from "three";
import { useFrame } from "@react-three/fiber";
import {
  BAY_BY_NUMBER,
  arrivalPath,
  departurePath,
  type BaySlot,
} from "@shared/lotLayout";
import type { VehicleType } from "@shared/types";
import { CarModel } from "./CarModel";
import { measurePath, samplePath, type MeasuredPath } from "./pathSampler";

import { useLotStore } from "../store/useLotStore";

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

type AgentPhase = "arriving" | "parked" | "leaving";

/**
 * Live agent map, hoisted to module scope so the dev-only inspection hook at the
 * bottom of this file can read it. Only ever assigned by CarFleet.
 */
const liveAgents = new Map<string, Agent>();

/** A live vehicle. Progress is mutated every frame, so this never lives in state. */
interface Agent {
  key: string;
  bay: BaySlot;
  plate: string;
  vehicleType: VehicleType;
  phase: AgentPhase;
  /** Distance covered along the active path, in metres. */
  distance: number;
  /** Current ground speed in m/s, integrated rather than fixed. */
  speed: number;
  /** True while the vehicle is braking, so the brake lights come on. */
  braking: boolean;
  arrival: MeasuredPath;
  departure: MeasuredPath;
}

/** The immutable slice of an agent that React needs in order to render it. */
interface FleetEntry {
  key: string;
  vehicleType: VehicleType;
  plate: string;
  /** Brake lights on. Flips only a couple of times per journey. */
  braking: boolean;
  /** Reversing into or out of a bay. */
  reversing: boolean;
}

/**
 * Metres per second. Scaled well above real lot speeds so a drive-in reads as a
 * short animation rather than a minute-long wait, but the *shape* of the motion
 * is realistic: it accelerates away from the gate, holds a cruise, slows for
 * corners and brakes to a stop in the bay.
 */
const CRUISE_SPEED = 9;
const ACCELERATION = 7;
const BRAKING = 16;
/** Slowest a vehicle may crawl through a corner. */
const CORNER_SPEED = 3.2;
/** Below this, the vehicle is treated as decelerating into its stop. */
const BRAKE_LIGHT_THRESHOLD = 2.4;

function buildAgent(
  spaceNumber: string,
  plate: string,
  vehicleType: VehicleType,
): Agent | null {
  const bay = BAY_BY_NUMBER.get(spaceNumber);
  if (bay === undefined) return null;

  const arrival = measurePath(arrivalPath(bay));
  const departure = measurePath(departurePath(bay));

  return {
    key: `${spaceNumber}:${plate}`,
    bay,
    plate,
    vehicleType,
    phase: "arriving",
    distance: 0,
    speed: 0,
    braking: false,
    arrival,
    departure,
  };
}

/**
 * Advances a vehicle by one frame using a target speed rather than a fixed
 * progress rate.
 *
 * The target is the slowest of three constraints, which is what produces natural
 * motion: the cruise ceiling, a corner limit derived from how sharply the path
 * is turning, and the speed at which the remaining distance can still be braked
 * away from. Speed then chases that target with its own acceleration or braking
 * rate, so nothing starts or stops instantly.
 */
function advance(agent: Agent, delta: number): void {
  const path = agent.phase === "leaving" ? agent.departure : agent.arrival;
  const total = path.total;
  if (total <= 0) {
    agent.distance = total;
    agent.speed = 0;
    return;
  }

  const remaining = Math.max(0, total - agent.distance);

  // Sample slightly ahead to see how sharp the road is about to get.
  const lookAhead = Math.min(total, agent.distance + Math.max(4, agent.speed * 1.1));
  const sample = samplePath(path, lookAhead / total);
  const cornerLimit = CORNER_SPEED + (1 - Math.min(1, sample.turnRate / 0.9)) * (CRUISE_SPEED - CORNER_SPEED);

  // Comfortable speed that still allows a full stop in the remaining distance.
  const stoppingLimit = Math.sqrt(2 * BRAKING * remaining);

  const target = Math.max(0.6, Math.min(CRUISE_SPEED, cornerLimit, stoppingLimit));

  const rate = target > agent.speed ? ACCELERATION : BRAKING;
  const deltaSpeed = (target - agent.speed) * Math.min(1, (delta * rate) / Math.max(0.5, Math.abs(target - agent.speed) + 0.5));

  agent.speed += deltaSpeed;
  agent.distance = Math.min(total, agent.distance + agent.speed * delta);

  agent.braking = agent.speed < BRAKE_LIGHT_THRESHOLD && remaining < 8;
}

/**
 * Renders every vehicle on the lot and drives it along its bay's route.
 *
 * Driven entirely by the `spaces` array in the store, which the WebSocket feed
 * keeps current. Live per-frame progress lives in a ref and is mutated in
 * place; React state only ever holds the immutable list of which vehicles
 * exist, so the fleet re-renders on arrivals and departures rather than sixty
 * times a second.
 */
export function CarFleet() {
  const agentsRef = useRef<Map<string, Agent>>(new Map());

  const meshesRef = useRef<Map<string, Group>>(new Map());
  const [fleet, setFleet] = useState<FleetEntry[]>([]);

  const place = useCallback((key: string): void => {
    const mesh = meshesRef.current.get(key);
    const agent = agentsRef.current.get(key);
    if (mesh === undefined || agent === undefined) return;

    const path = agent.phase === "leaving" ? agent.departure : agent.arrival;
    // A departing vehicle starts fully parked, so it runs the path in reverse.
    const t = agent.phase === "leaving" ? 1 - agent.distance / path.total : agent.distance / path.total;
    const sample = samplePath(path, t);

    mesh.position.set(sample.x, 0, sample.z);
    mesh.rotation.y = sample.rotationY;
  }, []);

  /**
   * Whether a vehicle is travelling backwards relative to its own nose.
   *
   * Sampled by stepping a short distance either side along the path and
   * comparing the direction of travel with the facing, which is how you detect
   * a reverse manoeuvre without the layout having to declare it.
   */
  const isReversing = useCallback((agent: Agent): boolean => {
    const path = agent.phase === "leaving" ? agent.departure : agent.arrival;
    if (path.total <= 0 || agent.speed < 0.4) return false;

    const here = agent.distance / path.total;
    const step = Math.min(0.02, Math.max(0.002, 4 / path.total));

    // A departing vehicle runs its path backwards, so "ahead" is behind it.
    const sign = agent.phase === "leaving" ? -1 : 1;
    const a = samplePath(path, clamp01(here - step * sign));
    const b = samplePath(path, clamp01(here + step * sign));

    const dx = b.x - a.x;
    const dz = b.z - a.z;
    if (Math.hypot(dx, dz) < 1e-6) return false;

    // Forward vector for the current heading.
    const fx = Math.sin(samplePath(path, here).rotationY);
    const fz = Math.cos(samplePath(path, here).rotationY);

    return dx * fx + dz * fz < 0;
  }, []);

  useFrame((_, rawDelta) => {
    // Clamp so a backgrounded tab does not teleport every vehicle on resume.
    const delta = Math.min(rawDelta, 0.1);
    const spaces = useLotStore.getState().spaces;
    const agents = agentsRef.current;

    // Mirror onto the module-level handle so the dev-only inspection hook can
    // read live counters without a ref or a re-render.
    liveAgents.clear();
    for (const [key, agent] of agents) liveAgents.set(key, agent);

    /** Every bay that currently has a driver assigned to it, keyed by bay+plate. */
    const wanted = new Map<string, { plate: string; vehicleType: VehicleType }>();

    // The replay reports which bays were held, not which plate was in them, so
    // a scrubbed frame falls back to the current occupant where the bay still
    // matches and otherwise shows the bay occupied by a stand-in plate. The
    // point is that the lot visibly refills, not that it is forensic evidence.
    const replayBays = useLotStore.getState().replayBays;

    for (const space of spaces) {
      const session = space.session;
      const replayed = replayBays?.has(space.spaceNumber) ?? false;
      const liveOccupied = space.status === "occupied" && session !== null;

      if (replayBays !== null) {
        if (!replayed) continue;

        wanted.set(
          `${space.spaceNumber}:${session?.vehicle.numberPlate ?? space.spaceNumber}`,
          {
            plate: session?.vehicle.numberPlate ?? `REPLAY ${space.spaceNumber}`,
            vehicleType: session?.vehicle.type ?? space.type,
          },
        );
        continue;
      }

      if (!liveOccupied || session === null) continue;

      wanted.set(`${space.spaceNumber}:${session.vehicle.numberPlate}`, {
        plate: session.vehicle.numberPlate,
        vehicleType: session.vehicle.type,
      });
    }

    const retire = (key: string): void => {
      agents.delete(key);
      meshesRef.current.delete(key);
    };

    // Any vehicle whose session has closed starts heading for the gate.
    for (const agent of agents.values()) {
      if (wanted.has(agent.key) || agent.phase === "leaving") continue;

      agent.phase = "leaving";
      agent.distance = 0;
      // Pulls away from the bay, so it starts from rest rather than a run-up.
      agent.speed = 0;
      agent.braking = false;
    }

    // Vehicles that have just been issued a bay drive on from the gate.
    for (const [key, request] of wanted) {
      if (agents.has(key)) continue;

      const spaceNumber = key.slice(0, key.lastIndexOf(":"));

      // A vehicle that is still driving out is never deleted to make room.
      // Removing it here was what made cars vanish part-way down the aisle: the
      // mesh was unmounted mid-journey, so a section-A car would disappear the
      // moment its bay was reissued instead of pulling away and leaving site.
      // A leaving vehicle keeps its own mesh and simply drives out.
      for (const other of agents.values()) {
        if (other.bay.spaceNumber !== spaceNumber) continue;

        if (other.phase === "parked") {
          // Only genuinely parked cars can be stood down, and they are already
          // hidden behind the new arrival's drive-in.
          retire(other.key);
        }
        break;
      }

      const agent = buildAgent(spaceNumber, request.plate, request.vehicleType);
      if (agent !== null) agents.set(agent.key, agent);
    }

    // Advance, place, and drop anything that has left the site.
    for (const [key, agent] of [...agents]) {
      if (agent.phase !== "parked") {
        advance(agent, delta);

        const path = agent.phase === "leaving" ? agent.departure : agent.arrival;
        if (agent.distance >= path.total) {
          if (agent.phase === "arriving") {
            agent.phase = "parked";
            agent.distance = path.total;
            agent.speed = 0;
          } else {
            retire(key);
            continue;
          }
        }
      }

      place(key);
    }

    const next: FleetEntry[] = [...agents.values()].map((agent) => ({
      key: agent.key,
      vehicleType: agent.vehicleType,
      plate: agent.plate,
      braking: agent.braking,
      reversing: isReversing(agent),
    }));

    // Only publish when membership or a light state actually changed; position
    // and progress move in place every frame without touching React.
    const changed =
      next.length !== fleet.length ||
      next.some((entry, index) => {
        const previous = fleet[index];
        return (
          entry.key !== previous?.key ||
          entry.braking !== previous?.braking ||
          entry.reversing !== previous?.reversing
        );
      });

    if (changed) setFleet(next);
  });

  return (
    <group>
      {fleet.map((entry) => (
        <group
          key={entry.key}
          ref={(node) => {
            if (node === null) {
              meshesRef.current.delete(entry.key);
              return;
            }
            meshesRef.current.set(entry.key, node);
            // Place immediately so a vehicle spawning this frame does not flash
            // at the origin before the loop positions it.
            place(entry.key);
          }}
        >
          <CarModel
            vehicleType={entry.vehicleType}
            plate={entry.plate}
            braking={entry.braking}
            reversing={entry.reversing}
          />
        </group>
      ))}
    </group>
  );
}
/**
 * Read-only snapshot of the fleet, for verifying motion behaviour in a browser.
 *
 * Dev-only and deliberately outside React: it reports live counters that change
 * every frame, so routing them through state would re-render the whole fleet
 * sixty times a second purely for the sake of a test hook.
 */
if (import.meta.env.DEV) {
  (globalThis as unknown as { __fleetDebug?: () => unknown }).__fleetDebug = () => {
    const agents = [...liveAgents.values()];

    return {
      total: agents.length,
      parked: agents.filter((agent) => agent.phase === "parked").length,
      arriving: agents.filter((agent) => agent.phase === "arriving").length,
      leaving: agents.filter((agent) => agent.phase === "leaving").length,
      // Vehicles that have left their bay but are still on site. If this ever
      // returns to zero while departures are still running, cars are being
      // culled mid-aisle instead of driving out.
      midAisle: agents.filter(
        (agent) => agent.phase === "leaving" && agent.distance > 1,
      ).length,
    };
  };
}
