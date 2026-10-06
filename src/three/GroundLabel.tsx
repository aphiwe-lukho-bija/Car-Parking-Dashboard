import { useMemo } from "react";
import { labelTexture } from "./labelTexture";

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