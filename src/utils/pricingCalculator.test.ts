/// <reference types="jest" />

import { calculateParkingFee } from "./pricingCalculator";

describe("calculateParkingFee", () => {
  const checkIn = new Date("2026-08-15T10:00:00");

  test("10-minute visit should be free", () => {
    const checkOut = new Date("2026-08-15T10:10:00");

    expect(
      calculateParkingFee({
        checkInTime: checkIn,
        checkOutTime: checkOut,
        gracePeriodMinutes: 10,
        hourlyRate: 10,
        dailyMaximum: 100,
      })
    ).toBe(0);
  });

  test("61-minute visit should charge for 2 hours", () => {
    const checkOut = new Date("2026-08-15T11:01:00");

    expect(
      calculateParkingFee({
        checkInTime: checkIn,
        checkOutTime: checkOut,
        gracePeriodMinutes: 10,
        hourlyRate: 10,
        dailyMaximum: 100,
      })
    ).toBe(20);
  });

  test("fee should not exceed the daily maximum", () => {
    const checkOut = new Date("2026-08-15T20:00:00");

    expect(
      calculateParkingFee({
        checkInTime: checkIn,
        checkOutTime: checkOut,
        gracePeriodMinutes: 10,
        hourlyRate: 20,
        dailyMaximum: 100,
      })
    ).toBe(100);
  });

  test("checkout before check-in should throw an error", () => {
    const checkOut = new Date("2026-08-15T09:00:00");

    expect(() =>
      calculateParkingFee({
        checkInTime: checkIn,
        checkOutTime: checkOut,
        gracePeriodMinutes: 10,
        hourlyRate: 10,
        dailyMaximum: 100,
      })
    ).toThrow("Check-out time cannot be before check-in time.");
  });

  test("exactly the grace period should be free", () => {
    const checkOut = new Date("2026-08-15T10:10:00");

    expect(
      calculateParkingFee({
        checkInTime: checkIn,
        checkOutTime: checkOut,
        gracePeriodMinutes: 10,
        hourlyRate: 10,
        dailyMaximum: 100,
      })
    ).toBe(0);
  });
});