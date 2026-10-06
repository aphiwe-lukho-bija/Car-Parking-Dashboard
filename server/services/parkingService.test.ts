import { describe, expect, it } from "vitest";
import type { PricingRule } from "../../shared/types";
import { buildSession } from "./parkingService";

const rules: PricingRule[] = [
  {
    id: 1,
    vehicleType: "car",
    label: "Car",
    gracePeriodMinutes: 15,
    hourlyRate: 10,
    dailyMaximum: 100,
    currency: "ZAR",
  },
];

describe("buildSession", () => {
  it("bills an open stay from its own check-in when the clock reads early", () => {
    const now = new Date("2026-10-06T10:00:00.400Z");
    const checkInTime = new Date("2026-10-06T10:00:01.000Z");

    const session = buildSession(
      {
        id: 1,
        spaceNumber: "A-01",
        vehicle: { id: 1, numberPlate: "CA 000 001", type: "car" },
        checkInTime,
        checkOutTime: null,
        status: "active",
        finalFee: null,
      },
      rules,
      now,
    );

    expect(session.runningFee).toBe(0);
    expect(session.overGrace).toBe(false);
  });
});