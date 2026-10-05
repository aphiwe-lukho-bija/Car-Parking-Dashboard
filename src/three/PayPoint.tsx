import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { CENTRAL_AISLE_WIDTH, GATE_X } from "@shared/lotLayout";
import { GroundLabel } from "./GroundLabel";

/** Where the pay station sits: on the exit side of the gate, on the aisle. */
const PAY_X = GATE_X + 11;

/**
 * Shared screen material, pulsed once per frame.
 *
 * Module-level because there is exactly one pay station in the scene: keeping
 * it out of the component lets the frame loop mutate `opacity` in place, which
 * is what a per-frame animation requires, without recreating the material.
 */
const SCREEN_MATERIAL = new THREE.MeshBasicMaterial({
  color: "#7fd4ff",
  transparent: true,
  opacity: 0.9,
  toneMapped: false,
});

/**
 * The physical pay point.
 *
 * This is the object that makes the payment step legible in the 3D view: a
 * lit totem on the exit lane between the bays and the boom gate, so a driver
 * leaving the site has to drive past it. Includes a canopy, a screen showing
 * the tariff, and a marked stopping box on the tarmac.
 */
export function PayPoint() {
  useFrame(({ clock }) => {
    // Slow pulse so the eye is drawn to the pay station while presenting.
    SCREEN_MATERIAL.opacity = 0.82 + Math.sin(clock.elapsedTime * 1.6) * 0.14;
  });

  return (
    <group position={[PAY_X, 0, -(CENTRAL_AISLE_WIDTH / 2 + 1.9)]}>
      {/* Concrete plinth */}
      <mesh castShadow receiveShadow position={[0, 0.09, 0]}>
        <boxGeometry args={[1.5, 0.18, 1.5]} />
        <meshStandardMaterial color="#b9b3a6" roughness={0.9} metalness={0.05} />
      </mesh>

      {/* Totem body, canted slightly back like a real ticket machine */}
      <mesh castShadow position={[0, 0.95, 0]} rotation={[-0.12, 0, 0]}>
        <boxGeometry args={[0.78, 1.6, 0.5]} />
        <meshStandardMaterial color="#2f3641" roughness={0.45} metalness={0.55} />
      </mesh>

      {/* Brand cap so it reads as Apex hardware */}
      <mesh castShadow position={[0, 1.78, 0]}>
        <boxGeometry args={[0.84, 0.16, 0.54]} />
        <meshStandardMaterial color="#d4af37" roughness={0.35} metalness={0.75} />
      </mesh>

      {/* Screen: angled back, faces the approaching driver */}
      <mesh position={[0, 1.28, 0.27]} rotation={[-0.28, 0, 0]}>
        <planeGeometry args={[0.62, 0.46]} />
        <primitive object={SCREEN_MATERIAL} attach="material" />
      </mesh>

      {/* Card reader and keypad shelf */}
      <mesh castShadow position={[0.42, 1.1, 0.16]}>
        <boxGeometry args={[0.26, 0.34, 0.16]} />
        <meshStandardMaterial color="#1d222a" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.86, 0.28]} rotation={[-0.5, 0, 0]}>
        <boxGeometry args={[0.5, 0.05, 0.26]} />
        <meshStandardMaterial color="#454c58" roughness={0.6} metalness={0.5} />
      </mesh>

      {/* Coin slot */}
      <mesh position={[0.2, 1.05, 0.26]}>
        <cylinderGeometry args={[0.04, 0.04, 0.03, 10]} />
        <meshStandardMaterial color="#c9a227" metalness={0.9} roughness={0.25} />
      </mesh>

      {/* Canopy over the station, so it reads as a shelter at a distance */}
      <mesh castShadow position={[0, 2.5, -0.1]}>
        <boxGeometry args={[2.6, 0.12, 2.0]} />
        <meshStandardMaterial color="#39404c" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh castShadow position={[-1.1, 1.3, -0.1]}>
        <cylinderGeometry args={[0.06, 0.08, 2.4, 8]} />
        <meshStandardMaterial color="#5b636e" roughness={0.5} metalness={0.7} />
      </mesh>
      <mesh castShadow position={[1.1, 1.3, -0.1]}>
        <cylinderGeometry args={[0.06, 0.08, 2.4, 8]} />
        <meshStandardMaterial color="#5b636e" roughness={0.5} metalness={0.7} />
      </mesh>

      {/* Marked stopping box on the tarmac so drivers pull up here */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 2.9]}>
        <planeGeometry args={[3.1, 5.2]} />
        <meshBasicMaterial color="#e8c34a" transparent opacity={0.2} depthWrite={false} />
      </mesh>
      {[-1.55, 1.55].map((offset) => (
        <mesh key={offset} rotation={[-Math.PI / 2, 0, 0]} position={[offset, 0.016, 2.9]}>
          <planeGeometry args={[0.12, 5.2]} />
          <meshBasicMaterial color="#f0d268" toneMapped={false} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.016, 0.3]}>
        <planeGeometry args={[3.22, 0.12]} />
        <meshBasicMaterial color="#f0d268" toneMapped={false} />
      </mesh>

      <GroundLabel
        position={[0, 0.02, 5.9]}
        text="PAY HERE"
        colour="#e8c34a"
        height={1.15}
        opacity={0.9}
      />
    </group>
  );
}