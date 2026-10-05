import { useMemo } from "react";
import * as THREE from "three";

const cache = new Map<string, THREE.CanvasTexture>();

/**
 * Renders text into a canvas texture.
 *
 * Used instead of drei's `<Text>` so labels need no web font: troika fetches
 * Roboto from a CDN at runtime, which would leave the lot unlabelled on an
 * offline or air-gapped machine. Drawing to a 2D canvas keeps the scene
 * self-contained and renders crisply at any zoom.
 */
function labelTexture(text: string, colour: string): THREE.CanvasTexture {
  const key = `${text}|${colour}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const fontSize = 88;
  const padding = 18;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("2D canvas is unavailable");

  const font = `600 ${fontSize}px "Inter", "Segoe UI", Arial, sans-serif`;
  context.font = font;

  const metrics = context.measureText(text);
  canvas.width = Math.ceil(metrics.width + padding * 2);
  canvas.height = Math.ceil(fontSize * 1.4);

  // measureText is relative to the previous font, so re-apply after resizing.
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = colour;
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  cache.set(key, texture);
  return texture;
}

export function GroundLabel({
  position,
  text,
  colour = "#8d95a3",
  height = 0.78,
  opacity = 0.8,
}: {
  position: [number, number, number];
  text: string;
  colour?: string;
  height?: number;
  opacity?: number;
}) {
  const texture = useMemo(() => labelTexture(text, colour), [text, colour]);

  const aspect = texture.image.width / texture.image.height;
  const width = height * aspect;

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}