import {
  Bloom,
  DepthOfField,
  EffectComposer,
  N8AO,
  SMAA,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { Vector3 } from "three";

/**
 * Rendering budget for the presentation.
 *
 * `high` buys ambient occlusion and antialiasing, which is what separates the
 * cars from the tarmac at close range. `lite` keeps only the effects that cost
 * one cheap fullscreen pass so the demo still runs on integrated graphics.
 */
export type VisualQuality = "high" | "lite";

export interface CinematicPostProps {
  quality: VisualQuality;
  /**
   * World position to hold in focus. Supplied by the close-up director; when it
   * is absent depth of field is skipped rather than defocusing at random.
   */
  focusTarget?: Vector3 | null;
}

/**
 * The look pass.
 *
 * Tone mapping deliberately happens here rather than on the renderer, because
 * the composer accumulates into a linear buffer first. Leaving the renderer's
 * own tone mapping on as well would apply the curve twice and wash the golden
 * hour out to a flat beige, so ParkingLot switches the renderer to
 * NoToneMapping to hand over responsibility for the whole frame.
 */
export function CinematicPost({ quality, focusTarget = null }: CinematicPostProps) {
  const isHigh = quality === "high";

  return (
    <EffectComposer
      // Multisampling is a real GPU cost, so the cheap path trades it for the
      // single-pass SMAA below rather than dropping antialiasing entirely.
      multisampling={isHigh ? 4 : 0}
      enableNormalPass={false}
    >
      {isHigh ? (
        <N8AO
          halfRes
          quality="medium"
          aoRadius={2.6}
          intensity={1.5}
          distanceFalloff={1}
          screenSpaceRadius={false}
        />
      ) : null}

      {/* Sun, headlights, brake lights, pay-station screen. The threshold sits
          well above the tarmac so only genuine light sources bloom — set it
          lower and a daylight scene turns the whole lot hazy and brown. */}
      <Bloom
        intensity={0.42}
        luminanceThreshold={0.88}
        luminanceSmoothing={0.22}
        mipmapBlur
        radius={0.55}
      />

      {focusTarget !== null ? (
        <DepthOfField
          target={focusTarget}
          worldFocusDistance={13}
          worldFocusRange={8}
          bokehScale={3.4}
          resolutionScale={0.5}
        />
      ) : null}

      {/* AGX rolls the sun's highlight off without clipping it to a flat
          orange, which matters once bloom is amplifying it. */}
      <ToneMapping mode={ToneMappingMode.AGX} />

      {/* Light touch only. Heavy vignetting reads as a night shot. */}
      <Vignette offset={0.34} darkness={0.34} />

      {isHigh ? <SMAA /> : null}
    {/* The composer already resolves 4× MSAA on the high path, so an extra
          SMAA pass there is pure cost. Lite drops MSAA and spends its one
          cheap pass on SMAA instead, so neither mode is left aliased. */}
      {quality === "lite" ? <SMAA /> : null}
    </EffectComposer>
  );
}