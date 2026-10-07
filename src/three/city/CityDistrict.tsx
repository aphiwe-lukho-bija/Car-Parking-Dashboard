import type { ReactElement } from "react";
import { Buildings } from "./Buildings";
import { Streets } from "./Streets";
import { StreetFurniture } from "./StreetFurniture";
import { StreetLife } from "./StreetLife";

/**
 * The city beyond the fence: two crossing avenues behind the shop rows, the
 * blocks that front them, and the furniture and traffic that make them read as
 * a working street rather than scenery.
 */
export function CityDistrict(): ReactElement {
  return (
    <group>
      <Streets />
      <Buildings />
      <StreetFurniture />
      <StreetLife />
    </group>
  );
}
