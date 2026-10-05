import { describe, expect, it } from "vitest";
import { calculateParkingFee } from "./pricing";
import { resolveRateCard } from "./pricingRules";
import type { RateCard, VehicleType } from "./types";

const carRule: RateCard = resolveRateCard("car");
const motorbikeRule: RateCard = resolveRateCard("motorbike");
const truckRule: RateCard = resolveRateCard("truck");

const DAY_ONE = "2026-08-15";
const DAY_TWO = "2026-08-16";
const DAY_THREE = "2026-08-17";
const DAY_FOUR = "2026-08-18";

const at = (day: string, time: string) => new Date(`${day}T${time}:00`);

const fee = (checkIn: Date, checkOut: Date, rule: RateCard = carRule) =>
  calculateParkingFee({ checkInTime: checkIn, checkOutTime: checkOut, rule });

describe("calculateParkingFee", () => {
  const checkIn = at(DAY_ONE, "10:00");

  it("charges nothing for a stay inside the grace period", () => {
    const result = fee(checkIn, at(DAY_ONE, "10:10"));

    expect(result.totalFee).toBe(0);
    expect(result.graceApplied).toBe(true);
    expect(result.lines).toHaveLength(0);
  });

  it("charges for the hour as soon as the grace period is exceeded", () => {
    expect(fee(checkIn, at(DAY_ONE, "10:11")).totalFee).toBe(15);
  });

  it("applies the started-hour rule to 61 minutes", () => {
    const result = fee(checkIn, at(DAY_ONE, "11:01"));

    expect(result.totalFee).toBe(30);
    expect(result.lines[0]?.hoursCharged).toBe(2);
  });

  it("never exceeds the daily maximum within a single day", () => {
    const result = fee(checkIn, at(DAY_ONE, "20:00"));

    expect(result.totalFee).toBe(100);
    expect(result.cappedDays).toBe(1);
    expect(result.lines[0]?.capped).toBe(true);
  });

  it("caps each calendar day separately on a multi-day stay", () => {
    const result = fee(checkIn, at(DAY_FOUR, "10:00"));

    expect(result.lines).toHaveLength(4);
    expect(result.cappedDays).toBe(4);
    expect(result.totalFee).toBe(400);
  });

  it("would have undercharged a multi-day stay before the per-day fix", () => {
    const result = fee(checkIn, at(DAY_FOUR, "10:00"));
    const naiveSingleCap = Math.min(result.totalMinutes / 60, 100 / 15);

    expect(result.totalFee).toBeGreaterThan(naiveSingleCap * 15);
  });

  it("bills a stay that crosses midnight as two segments", () => {
    const result = fee(at(DAY_ONE, "23:00"), at(DAY_TWO, "01:00"));

    expect(result.lines.map((line) => line.date)).toEqual([DAY_ONE, DAY_TWO]);
    expect(result.totalFee).toBe(30);
  });

  it("does not round up partial minutes within a day", () => {
    const result = fee(at(DAY_ONE, "08:00"), at(DAY_ONE, "09:30"));

    expect(result.lines[0]?.minutes).toBe(90);
    expect(result.totalFee).toBe(30);
  });

  it("treats a zero-length stay as free", () => {
    expect(fee(checkIn, checkIn).totalFee).toBe(0);
  });

  it("throws when check-out precedes check-in", () => {
    expect(() => fee(checkIn, at(DAY_ONE, "09:00"))).toThrow(
      "Check-out time cannot be before check-in time.",
    );
  });

  it("prices motorbikes at the motorbike rate card", () => {
    expect(fee(checkIn, at(DAY_ONE, "20:00"), motorbikeRule).totalFee).toBe(50);
  });

  it("honours a longer grace period for trucks", () => {
    expect(fee(checkIn, at(DAY_ONE, "10:15"), truckRule).totalFee).toBe(0);
    expect(fee(checkIn, at(DAY_ONE, "10:16"), truckRule).totalFee).toBe(25);
  });

  it("reports the currency from the rate card", () => {
    expect(fee(checkIn, at(DAY_ONE, "12:00")).currency).toBe("ZAR");
  });

  it("spans three days as expected", () => {
    const result = fee(checkIn, at(DAY_THREE, "12:00"));

    expect(result.lines.map((line) => line.date)).toEqual([
      DAY_ONE,
      DAY_TWO,
      DAY_THREE,
    ]);
  });
});

describe("resolveRateCard", () => {
  const types: VehicleType[] = ["car", "suv", "truck", "motorbike"];

  it.each(types)("returns a rate card for %s", (type) => {
    expect(resolveRateCard(type)).toMatchObject({
      hourlyRate: expect.any(Number),
      dailyMaximum: expect.any(Number),
      currency: "ZAR",
    });
  });

  it("falls back to the standard rate when a type has no rule", () => {
    const onlyCars = [{ ...resolveRateCard("car") }].map((rule, index) => ({
      ...rule,
      id: index + 1,
      vehicleType: "car" as const,
      label: "Standard Car",
    }));

    expect(resolveRateCard("suv", onlyCars)).toEqual(resolveRateCard("car"));
  });
});
describe("daily cap timing", () => {
  const rule = {
    gracePeriodMinutes: 10,
    hourlyRate: 15,
    dailyMaximum: 100,
    currency: "ZAR",
  };

  it("reports no cap for a stay that stays under the maximum", () => {
    const result = calculateParkingFee({
      checkInTime: new Date("2026-03-04T08:00:00"),
      checkOutTime: new Date("2026-03-04T10:00:00"),
      rule,
    });

    expect(result.cappedDays).toBe(0);
    expect(result.lines[0]?.capped).toBe(false);
    expect(result.lines[0]?.cappedAt).toBeNull();
  });

  it("stamps the cap at the start of the first hour that would overrun", () => {
    // R15/hr against a R100 cap means six hours fit (R90); the seventh hour is
    // the one that tips the day over, so the cap bites six hours in.
    const result = calculateParkingFee({
      checkInTime: new Date("2026-03-04T08:00:00"),
      checkOutTime: new Date("2026-03-04T20:00:00"),
      rule,
    });

    const line = result.lines[0];
    expect(line?.capped).toBe(true);
    expect(line?.amount).toBe(100);
    expect(line?.cappedAt).toEqual(new Date("2026-03-04T14:00:00"));
  });

  it("caps each day separately and stamps each independently", () => {
    const result = calculateParkingFee({
      checkInTime: new Date("2026-03-04T08:00:00"),
      checkOutTime: new Date("2026-03-06T20:00:00"),
      rule,
    });

    expect(result.lines).toHaveLength(3);
    expect(result.totalFee).toBe(300);
    expect(result.lines.every((line) => line.capped)).toBe(true);
    expect(result.lines[0]?.cappedAt).toEqual(new Date("2026-03-04T14:00:00"));
    expect(result.lines[1]?.cappedAt).toEqual(new Date("2026-03-05T06:00:00"));
    expect(result.lines[2]?.cappedAt).toEqual(new Date("2026-03-06T06:00:00"));
  });

  it("handles a cap that lands exactly on a whole hour", () => {
    const exact = calculateParkingFee({
      checkInTime: new Date("2026-03-04T08:00:00"),
      checkOutTime: new Date("2026-03-04T20:00:00"),
      rule: { ...rule, hourlyRate: 10, dailyMaximum: 100 },
    });

    // R10/hr against a R100 cap: ten hours fit exactly, so the cap is only
    // reached when the eleventh hour starts.
    expect(exact.lines[0]?.capped).toBe(true);
    expect(exact.lines[0]?.cappedAt).toEqual(new Date("2026-03-04T18:00:00"));
  });
});
