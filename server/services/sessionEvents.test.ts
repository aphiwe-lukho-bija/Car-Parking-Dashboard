import { describe, expect, it, vi } from "vitest";
import {
  onSessionEvent,
  publishSessionClosed,
  publishSessionOpened,
} from "./sessionEvents";

const payload = {
  session: { id: 7 },
  space: { spaceNumber: "A-01" },
  stats: { occupied: 12 },
} as never;

describe("session event bus", () => {
  it("delivers arrivals to subscribers", () => {
    const listener = vi.fn();
    const off = onSessionEvent("opened", listener);

    publishSessionOpened(payload);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(payload);
    off();
  });

  it("delivers departures to subscribers", () => {
    const listener = vi.fn();
    const off = onSessionEvent("closed", listener);

    publishSessionClosed({ ...payload, payment: { id: 3 } } as never);

    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it("stops delivering after unsubscribe", () => {
    const listener = vi.fn();
    const off = onSessionEvent("opened", listener);

    off();
    publishSessionOpened(payload);

    expect(listener).not.toHaveBeenCalled();
  });

  it("reaches every subscriber, so all dashboards see one car", () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = onSessionEvent("opened", first);
    const offSecond = onSessionEvent("opened", second);

    publishSessionOpened(payload);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    offFirst();
    offSecond();
  });
});
