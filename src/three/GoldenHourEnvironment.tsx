import { useMemo } from "react";
import * as THREE from "three";
import { Environment, Lightformer } from "@react-three/drei";
import { SKY, SUN_DIRECTION } from "./SkyDome";

/**
 * Builds the vertical sky gradient that the environment cube captures.
 *
 * drei's own `preset="sunset"` fetches an HDRI from a CDN, which means the car
 * paint loses its reflections the moment the presentation wifi does. Painting
 * the gradient into a texture instead keeps the build self-contained and lets
 * the reflections match the visible sky dome exactly, because both read from
 * the same SKY palette.
 */
function useSkyGradientTexture(): THREE.Texture {
  return useMemo(() => {
    const height = 128;
    const zenith = new THREE.Color(SKY.zenith);
    const horizon = new THREE.Color(SKY.horizon);
    const ground = new THREE.Color(SKY.ground);

    const data = new Uint8Array(height * 4);
    const mixed = new THREE.Color();

    for (let row = 0; row < height; row += 1) {
      // Row 0 is the top of the texture, which maps to the sky dome's zenith.
      const t = row / (height - 1);

      if (t < 0.55) {
        mixed.copy(zenith).lerp(horizon, Math.pow(t / 0.55, 0.7));
      } else {
        mixed.copy(horizon).lerp(ground, (t - 0.55) / 0.45);
      }

      const offset = row * 4;
      data[offset] = Math.round(mixed.r * 255);
      data[offset + 1] = Math.round(mixed.g * 255);
      data[offset + 2] = Math.round(mixed.b * 255);
      data[offset + 3] = 255;
    }

    const texture = new THREE.DataTexture(data, 1, height, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
  }, []);
}

/**
 * Image-based lighting for the golden-hour scene.
 *
 * The cars run a clearcoat physical material, and clearcoat is only convincing
 * when there is an environment for it to reflect. Without this the paint is
 * lit correctly but reflects nothing, which is what makes procedural vehicles
 * read as flat plastic.
 *
 * The map is captured once (`frames={1}`) because the sky and sun never move,
 * so there is no reason to pay for a cube render every frame.
 */
export function GoldenHourEnvironment({ intensity = 0 }: { intensity?: number }) {
  const skyGradient = useSkyGradientTexture();
  const sunPosition = useMemo(
    () => SUN_DIRECTION.clone().multiplyScalar(60).toArray(),
    [],
  );

  return (
    <Environment frames={1} resolution={256} background={false} environmentIntensity={intensity}>
      {/* The gradient sky itself, seen by every reflective surface in the lot. */}
      <mesh scale={100}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshBasicMaterial map={skyGradient} side={THREE.BackSide} toneMapped={false} />
      </mesh>

      {/* The sun itself, so paint and glass get a real specular highlight
          instead of a smeared blob. Wider and softer than a point source
          because an overcast-to-hazy midday sky is a broad emitter. */}
      <Lightformer
        form="circle"
        intensity={9}
        color={SKY.sun}
        scale={14}
        position={sunPosition}
        target={[0, 0, 0]}
      />

      {/* Neutral sky band on the sun's side, mirroring the dome's horizon. */}
      <Lightformer
        form="rect"
        intensity={1.5}
        color={SKY.glow}
        scale={80}
        position={[-45, 18, 30]}
        target={[0, 8, 0]}
      />

      {/* Counter-fill from the anti-sun side so flanks are not black. */}
      <Lightformer
        form="rect"
        intensity={1.1}
        color="#cddff2"
        scale={80}
        position={[45, 20, -35]}
        target={[0, 8, 0]}
      />

      {/* Tarmac bounce, which is what keeps the underside of the cars from
          going to black. Reads as a dim neutral floor, not a warm one. */}
      <Lightformer
        form="rect"
        intensity={0.55}
        color={SKY.bounce}
        scale={120}
        position={[0, -8, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        target={[0, 0, 0]}
      />
    </Environment>
  );
}