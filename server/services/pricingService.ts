import type { RowDataPacket } from "mysql2";
import { resolveRateCard } from "../../shared/pricingRules";
import type { PricingRule, RateCard, VehicleType } from "../../shared/types";
import { query } from "../config/db";

interface PricingRuleRow extends RowDataPacket {
  id: number;
  vehicle_type: VehicleType;
  label: string;
  grace_period_minutes: number;
  hourly_rate: number;
  daily_maximum: number;
  currency: string;
}

/**
 * Rate cards change rarely and are read on every tick, so they are cached
 * briefly rather than hitting MySQL thousands of times a minute.
 */
const CACHE_TTL_MS = 30_000;

let cached: { rules: PricingRule[]; expiresAt: number } | null = null;

export function invalidatePricingCache(): void {
  cached = null;
}

export async function getPricingRules(): Promise<PricingRule[]> {
  if (cached !== null && cached.expiresAt > Date.now()) return cached.rules;

  const rows = await query<PricingRuleRow>(
    `SELECT id, vehicle_type, label, grace_period_minutes, hourly_rate,
            daily_maximum, currency
       FROM pricing_rules
      ORDER BY id`,
  );

  const rules: PricingRule[] = rows.map((row) => ({
    id: row.id,
    vehicleType: row.vehicle_type,
    label: row.label,
    gracePeriodMinutes: row.grace_period_minutes,
    hourlyRate: Number(row.hourly_rate),
    dailyMaximum: Number(row.daily_maximum),
    currency: row.currency,
  }));

  cached = { rules, expiresAt: Date.now() + CACHE_TTL_MS };
  return rules;
}

export async function getRateCard(
  vehicleType: VehicleType,
): Promise<RateCard> {
  return resolveRateCard(vehicleType, await getPricingRules());
}

export async function updatePricingRule(
  id: number,
  patch: { hourlyRate?: number; dailyMaximum?: number; gracePeriodMinutes?: number },
): Promise<PricingRule | null> {
  const sets: string[] = [];
  const params: (string | number)[] = [];

  if (patch.hourlyRate !== undefined) {
    sets.push("hourly_rate = ?");
    params.push(patch.hourlyRate);
  }
  if (patch.dailyMaximum !== undefined) {
    sets.push("daily_maximum = ?");
    params.push(patch.dailyMaximum);
  }
  if (patch.gracePeriodMinutes !== undefined) {
    sets.push("grace_period_minutes = ?");
    params.push(patch.gracePeriodMinutes);
  }

  if (sets.length === 0) return null;

  await query(
    `UPDATE pricing_rules SET ${sets.join(", ")} WHERE id = ?`,
    [...params, id],
  );
  invalidatePricingCache();

  const rules = await getPricingRules();
  return rules.find((rule) => rule.id === id) ?? null;
}