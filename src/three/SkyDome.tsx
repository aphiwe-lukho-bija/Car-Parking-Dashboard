import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

/**
 * Late-afternoon Cape Town palette.
 *
 * Kept in one place because the sky dome, the fog and the sun light all have to
 * agree — if the fog drifts off the horizon colour the join between sky and
 * ground becomes visible as a hard seam from altitude.
 */
export const SKY = {
  zenith: "#1d4a8f",
  horizon: "#f6c98a",
  /** Just above the skyline, where the sun sits. */
  glow: "#ffd79a",
  sun: "#fff2d0",
  /** Warm light bouncing off the tarmac back up into the cars. */
  bounce: "#7a6448",
  ground: "#4a4238",
  haze: "#e8c9a0",
} as const;

/** Where the sun is, as a unit direction. Low and to the west for long shadows. */
export const SUN_DIRECTION = new THREE.Vector3(-0.62, 0.3, 0.42).normalize();

const SKY_VERTEX = /* glsl */ `
  varying vec3 vWorldDirection;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform vec3 uSun;
  uniform vec3 uSunDirection;
  varying vec3 vWorldDirection;

  void main() {
    vec3 direction = normalize(vWorldDirection);

    // Height above the horizon, biased so the gradient spends most of its
    // range in the band the camera actually looks at from a low angle.
    float height = clamp(direction.y * 1.15 + 0.06, 0.0, 1.0);
    float gradient = pow(height, 0.62);

    vec3 colour = mix(uHorizon, uZenith, gradient);

    // Broad atmospheric scatter around the sun, plus a tight disc.
    float sunAmount = max(dot(direction, uSunDirection), 0.0);
    colour += uGlow * pow(sunAmount, 5.0) * 0.55;
    colour += uGlow * pow(sunAmount, 48.0) * 0.9;
    colour = mix(colour, uSun, smoothstep(0.9975, 0.9995, sunAmount));

    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Sky dome.
 *
 * Drawn as an inverted sphere locked to the camera rather than as a distant
 * object, so zooming out to altitude never reveals its edge. Depth writing is
 * off because the dome is always the furthest thing in the scene.
 */
export function SkyDome() {
  const uniforms = useMemo(
    () => ({
      uZenith: { value: new THREE.Color(SKY.zenith) },
      uHorizon: { value: new THREE.Color(SKY.horizon) },
      uGlow: { value: new THREE.Color(SKY.glow) },
      uSun: { value: new THREE.Color(SKY.sun) },
      uSunDirection: { value: SUN_DIRECTION.clone() },
    }),
    [],
  );

  return (
    <mesh scale={[-1, 1, 1]} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[1, 32, 24]} />
      <shaderMaterial
        vertexShader={SKY_VERTEX}
        fragmentShader={SKY_FRAGMENT}
        uniforms={uniforms}
        side={THREE.FrontSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * Procedural fractal-noise cloud sheet, drawn once onto a canvas.
 *
 * Generated rather than shipped as an image so the build stays self-contained
 * and there is nothing to license. Value noise is cheap enough to bake at load
 * time and gives the soft, billowy edges a hard-edged alpha ramp cannot.
 */
function buildCloudTexture(seed: number): THREE.Texture {
  {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    if (context === null) throw new Error("2D canvas unavailable");

    const image = context.createImageData(size, size);

    // Deterministic hash-based value noise, so the sky is identical on reload.
    const hash = (x: number, y: number): number => {
      const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
      return n - Math.floor(n);
    };

    const smooth = (t: number): number => t * t * (3 - 2 * t);

    const valueNoise = (x: number, y: number): number => {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = smooth(x - x0);
      const fy = smooth(y - y0);

      const a = hash(x0, y0);
      const b = hash(x0 + 1, y0);
      const c = hash(x0, y0 + 1);
      const d = hash(x0 + 1, y0 + 1);

      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let amplitude = 1;
        let frequency = 4 / size;
        let value = 0;

        // Five octaves: enough structure to read as cloud, cheap enough to bake.
        for (let octave = 0; octave < 5; octave += 1) {
          value += valueNoise(x * frequency, y * frequency) * amplitude;
          amplitude *= 0.5;
          frequency *= 2.07;
        }

        // Normalise, then ramp hard into soft-edged billows.
        const density = Math.max(0, Math.min(1, (value - 0.42) * 2.6));

        const index = (y * size + x) * 4;
        image.data[index] = 255;
        image.data[index + 1] = 252;
        image.data[index + 2] = 246;
        image.data[index + 3] = Math.round(Math.pow(density, 1.35) * 255);
      }
    }

    context.putImageData(image, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}

/**
 * Stacked cloud decks.
 *
 * Two layers at different altitudes, both large enough to reach the horizon.
 * This is what makes climbing to altitude pay off: the camera physically passes
 * through the lower deck on the way up.
 */
export function CloudLayer({
  altitude,
  seed,
  opacity = 0.85,
  drift = 0.0016,
  tint = "#fff6e8",
}: {
  altitude: number;
  seed: number;
  opacity?: number;
  drift?: number;
  tint?: string;
}) {
  // Memoised per seed, so each deck owns a distinct texture and can drift
  // independently without fighting another deck over the same offset.
  const { texture } = useMemo(() => ({ texture: buildCloudTexture(seed) }), [seed]);
  const size = 2400;

  useFrame((_, delta) => {
    const offset = texture.offset;
    offset.set(offset.x - delta * drift, offset.y + delta * drift * 0.25);
  });

  // Tile several times across the plane so the noise scale reads as cloud
  // rather than as one giant smear.
  const repeat = 3;

  useEffect(() => {
    texture.repeat.set(repeat, repeat);
    return () => texture.dispose();
  }, [texture, repeat]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, altitude, 0]}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial
        map={texture}
        alphaMap={texture}
        color={tint}
        transparent
        opacity={opacity}
        depthWrite={false}
        side={THREE.DoubleSide}
        fog={false}
      />
    </mesh>
  );
}