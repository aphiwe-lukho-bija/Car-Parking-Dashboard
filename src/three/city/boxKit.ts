import { useEffect, useMemo } from "react";
import * as THREE from "three";

export interface StdOptions {
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
}

/** A standard material, disposed when the caller unmounts. */
export function useStdMaterial(colour: string, options?: StdOptions): THREE.MeshStandardMaterial {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: colour,
        roughness: options?.roughness ?? 0.85,
        metalness: options?.metalness ?? 0.05,
        emissive: options?.emissive ?? "#000000",
        emissiveIntensity: options?.emissiveIntensity ?? 1,
      }),
    [colour, options?.roughness, options?.metalness, options?.emissive, options?.emissiveIntensity],
  );

  useEffect(() => () => material.dispose(), [material]);

  return material;
}

/** Box geometry plus a standard material, disposed when the caller unmounts. */
export function useBoxKit(colour: string, options?: StdOptions) {
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useStdMaterial(colour, options);

  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  return { geometry, material };
}
