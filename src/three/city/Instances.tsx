import { useLayoutEffect, useRef, type ReactElement } from "react";
import type * as THREE from "three";

/**
 * A finished instanced mesh: geometry and material are built once by the
 * caller, matrices are written a single time and never touched again.
 *
 * The whole district leans on this. Fifty buildings, a couple of thousand
 * window panes, every tree and every pedestrian are each one draw call
 * instead of one mesh apiece, which is what keeps the town affordable next to
 * the lot it has to share a frame with.
 */
export function Instances({
  matrices,
  colours,
  geometry,
  material,
  castShadow = false,
  receiveShadow = false,
}: {
  matrices: THREE.Matrix4[];
  colours?: THREE.Color[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
}): ReactElement {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (mesh === null) return;

    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;

    if (colours !== undefined) {
      colours.forEach((colour, index) => mesh.setColorAt(index, colour));
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    }

    mesh.computeBoundingSphere();
  }, [matrices, colours]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, matrices.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={false}
    />
  );
}
