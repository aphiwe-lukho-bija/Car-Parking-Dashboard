import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Eases a figure towards `value` so a number settling onto a new total reads as
 * a change rather than a jump.
 *
 * The running value is mirrored into a ref that the animation frame callback
 * owns. React state is only ever written from inside that callback, which keeps
 * the effect from triggering a cascading render on every prop change.
 */
export function useCountUp(value: number, durationMs = 700): number {
  const [display, setDisplay] = useState(value);
  const currentRef = useRef(value);
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => {
    if (reduced || durationMs <= 0) return;

    // Start from wherever the previous animation left off so an interrupted
    // count-up continues smoothly instead of jumping.
    const from = currentRef.current;
    let startedAt = 0;
    let frame = 0;

    const step = (now: number): void => {
      if (startedAt === 0) startedAt = now;

      const t = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      const next = from + (value - from) * eased;

      currentRef.current = next;
      setDisplay(next);

      if (t < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduced]);

  // With reduced motion the animation never runs, so the target value is
  // reported directly rather than whatever the last frame happened to reach.
  return reduced ? value : display;
}