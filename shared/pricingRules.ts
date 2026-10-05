import type { PricingRule, RateCard, VehicleType } from "./types";

export const CURRENCY = "ZAR";

/**
 * The facility's published tariff. This is the seed content for the
 * `pricing_rules` table; the database is the source of truth at runtime and
 * operators can edit rates without a deploy.
 */
export const DEFAULT_PRICING_RULES: readonly PricingRule[] = [
  {
    id: 1,
    vehicleType: "car",
    label: "Standard Car",
    gracePeriodMinutes: 10,
    hourlyRate: 15,
    dailyMaximum: 100,
    currency: CURRENCY,
  },
  {
    id: 2,
    vehicleType: "suv",
    label: "SUV / Light Commercial",
    gracePeriodMinutes: 10,
    hourlyRate: 20,
    dailyMaximum: 130,
    currency: CURRENCY,
  },
  {
    id: 3,
    vehicleType: "truck",
    label: "Truck & Oversize",
    gracePeriodMinutes: 15,
    hourlyRate: 25,
    dailyMaximum: 160,
    currency: CURRENCY,
  },
  {
    id: 4,
    vehicleType: "motorbike",
    label: "Motorbike",
    gracePeriodMinutes: 10,
    hourlyRate: 8,
    dailyMaximum: 50,
    currency: CURRENCY,
  },
] as const;

const FALLBACK_RULE: RateCard = {
  gracePeriodMinutes: 10,
  hourlyRate: 15,
  dailyMaximum: 100,
  currency: CURRENCY,
};

/** Resolves the rate card for a vehicle type, falling back to the car rate. */
export function resolveRateCard(
  vehicleType: VehicleType,
  rules: readonly PricingRule[] = DEFAULT_PRICING_RULES,
): RateCard {
  const match = rules.find((rule) => rule.vehicleType === vehicleType);
  if (!match) return FALLBACK_RULE;

  return {
    gracePeriodMinutes: match.gracePeriodMinutes,
    hourlyRate: match.hourlyRate,
    dailyMaximum: match.dailyMaximum,
    currency: match.currency,
  };
}