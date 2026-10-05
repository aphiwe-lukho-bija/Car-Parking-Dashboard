/**
 * A single shared clock.
 *
 * Components that display "12s ago" need to re-render on a timer. Giving each
 * one its own `setInterval` inside an effect would multiply timers and force a
 * cascading render on mount, so the clock is exposed as an external store and
 * consumed with `useSyncExternalStore` instead.
 */

let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

const listeners = new Set<() => void>();

function tick(): void {
  now = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // Start on first subscriber and stop once nobody is listening, so importing
  // this module never keeps a process alive on its own.
  if (timer === undefined) {
    now = Date.now();
    timer = setInterval(tick, 1000);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function getSnapshot(): number {
  return now;
}

export const clock = { subscribe, getSnapshot };