import { useMemo } from "react";
import { labelTexture } from "./labelTexture";

/**
 * A board on a post, with the text drawn by the same canvas pipeline the
 * ground labels use.
 *
 * Signs are what turn a slab with a gate into a place with an entrance: an
 * operator glancing at the scene should be able to read where they are and
 * what the rules are without leaving the view.
 */
export function RoadSign({
  position,
  rotationY = 0,
  text,
  width = 2.6,
  boardColour = "#1e4d2b",
  textColour = "#f4f1e8",
  postHeight = 2.2,
  frame = true,
}: {
  position: [number, number, number];
  rotationY?: number;
  text: string;
  width?: number;
  boardColour?: string;
  textColour?: string;
  postHeight?: number;
  frame?: boolean;
}) {
  const texture = useMemo(() => labelTexture(text, textColour), [text, textColour]);
  const aspect = texture.image.width / texture.image.height;

  // The text quad keeps its natural proportions and sits just proud of the
  // board, so long strings get a wide board rather than squashed lettering.
  const textHeight = Math.min(width / aspect, width * 0.4);
  const boardHeight = Math.max(0.5, textHeight * 1.9);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh castShadow position={[0, postHeight / 2, 0]}>
        <cylinderGeometry args={[0.055, 0.055, postHeight, 10]} />
        <meshStandardMaterial color="#6a707a" roughness={0.5} metalness={0.7} />
      </mesh>

      <mesh castShadow position={[0, postHeight + boardHeight / 2, 0]}>
        <boxGeometry args={[width, boardHeight, 0.08]} />
        <meshStandardMaterial color={boardColour} roughness={0.55} metalness={0.15} />
      </mesh>

      {frame ? (
        <mesh position={[0, postHeight + boardHeight / 2, 0.05]}>
          <boxGeometry args={[width - 0.12, boardHeight - 0.12, 0.02]} />
          <meshStandardMaterial color={textColour} transparent opacity={0.14} />
        </mesh>
      ) : null}

      <mesh position={[0, postHeight + boardHeight / 2, 0.075]}>
        <planeGeometry args={[textHeight * aspect, textHeight]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}