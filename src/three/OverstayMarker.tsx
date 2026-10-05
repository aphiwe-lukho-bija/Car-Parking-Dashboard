import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import type { BaySlot } from "@shared/lotLayout";
import { GroundLabel } from "./GroundLabel";

/**
 * Floating beacon over a bay that is formally flagged for overstay.
 *
 * The marker is deliberately tall and animated: it has to be findable from
 * anywhere in the scene when you are pointing at the lot mid-presentation,
 * rather than something you only notice by looking at the tarmac.
 */
export function OverstayMarker({ bay }: { bay: BaySlot }) {
  const group = useRef<Group>(null);

  useFrame(({ clock }) => {
    const node = group.current;
    if (node === null) return;

    const t = clock.elapsedTime;
    // Gentle bob, and a slow spin so the arrow reads as an active warning.
    node.position.y = 2.5 + Math.sin(t * 1.5) * 0.14;
    node.rotation.y = t * 0.9;
  });

  const inFront = bay.position.z < 0 ? 1 : -1;

  return (
    <group>
      <group
        ref={group}
        position={[bay.position.x, 2.5, bay.position.z + inFront * (bay.depth / 2 + 0.4)]}
      >
        {/* Downward warning arrow */}
        <mesh rotation={[Math.PI, 0, 0]} position={[0, 0.5, 0]}>
          <coneGeometry args={[0.34, 0.72, 4]} />
          <meshBasicMaterial color="#ff3355" toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.2, 8]} />
          <meshBasicMaterial color="#ff3355" toneMapped={false} />
        </mesh>
      </group>

      <GroundLabel
        position={[bay.position.x, 0.03, bay.position.z + inFront * (bay.depth / 2 + 2.1)]}
        text="OVERSTAY"
        colour="#ff5a72"
        height={1.05}
        opacity={0.95}
      />
    </group>
  );
}