import type { RowDataPacket } from "mysql2";
import type {
  AtRiskVehicle,
  RevenueDto,
  RevenueStream,
  VehicleType,
} from "../../shared/types";
import { calculateParkingFee } from "../../shared/pricing";
import { resolveRateCard } from "../../shared/pricingRules";
import { query } from "../config/db";
import { getPricingRules } from "./pricingService";
import { getOverstayTargets } from "./overstayService";

interface PaymentRow extends RowDataPacket {
  amount: number;
  paid_at: Date;
  session_id: number;
  vehicle_type: VehicleType;
}

interface ActiveSessionRow extends RowDataPacket {
  session_id: number;
  check_in_time: Date;
  space_number: string;
  number_plate: string;
  vehicle_type: VehicleType;
  is_overstay: number;
}

const MS_PER_MINUTE = 60_000;

/**
 * Local midnight, matching the timezone the pricing engine bills against.
 *
 * Deliberately built from local date parts rather than by subtracting 24h from
 * a UTC boundary: the facility timezone is pinned at process start, so
 * "today" means the operator's today, not UTC's.
 */
function startOfLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Revenue and collection exposure for the current operating day.
 *
 * Answers the two questions an operator actually asks: what did I take today,
 * and what am I currently owed by the cars sitting on my lot? The second is
 * the one that is normally invisible, and it is what makes an overstay worth
 * acting on.
 */
export async function getRevenue(
  now = new Date(),
  totalSpaces = 1,
): Promise<RevenueDto> {
  const dayStart = startOfLocalDay(now);
  const rules = await getPricingRules();
  const currency = rules[0]?.currency ?? "ZAR";

  const [payments, active, overstayTargets] = await Promise.all([
    query<PaymentRow>(
      `SELECT p.amount, p.paid_at, p.session_id, v.type AS vehicle_type
         FROM payments p
         JOIN parking_sessions s ON s.id = p.session_id
         JOIN vehicles v ON v.id = s.vehicle_id
        WHERE p.status = 'paid'
          AND p.paid_at IS NOT NULL
          AND p.paid_at >= ?`,
      [dayStart],
    ),
    query<ActiveSessionRow>(
      `SELECT s.id AS session_id, s.check_in_time, sp.space_number,
              v.number_plate, v.type AS vehicle_type, s.is_overstay
         FROM parking_sessions s
         JOIN parking_spaces sp ON sp.id = s.parking_space_id
         JOIN vehicles v ON v.id = s.vehicle_id
        WHERE s.status = 'active'
        ORDER BY s.check_in_time ASC`,
    ),
    getOverstayTargets(now),
  ]);

  // ---- Cash taken today -------------------------------------------------
  let collectedToday = 0;
  const hourly = Array.from({ length: 24 }, () => ({
    revenue: 0,
    sessions: 0,
  }));

  for (const payment of payments) {
    const amount = Number(payment.amount ?? 0);
    collectedToday += amount;

    const bucket = hourly[payment.paid_at.getHours()];
    if (bucket !== undefined) {
      bucket.revenue += amount;
      bucket.sessions += 1;
    }
  }

  const sessionsToday = payments.length;
  const averageTicket =
    sessionsToday === 0 ? 0 : round2(collectedToday / sessionsToday);

  // ---- Money owed by cars already on site ------------------------------
  let atRisk = 0;
  let cappedExposure = 0;
  const atRiskDetail: AtRiskVehicle[] = [];

  for (const session of active) {
    const rule = resolveRateCard(session.vehicle_type, rules);
    const breakdown = calculateParkingFee({
      checkInTime: session.check_in_time,
      checkOutTime: now,
      rule,
    });

    const accrued = round2(breakdown.totalFee);
    atRisk += accrued;

    // A capped day means the vehicle has stopped generating further revenue for
    // the day it is sitting in. Every extra hour it occupies a bay is pure
    // opportunity cost, which is what makes it a tow candidate.
    const cappedToday = breakdown.cappedDays > 0;
    const cappedLine = breakdown.lines.find((line) => line.capped);
    let minutesOverCap: number | null = null;

    if (cappedToday && cappedLine?.cappedAt != null) {
      cappedExposure += accrued;
      minutesOverCap = Math.max(
        0,
        Math.round((now.getTime() - cappedLine.cappedAt.getTime()) / MS_PER_MINUTE),
      );
    }

    atRiskDetail.push({
      sessionId: session.session_id,
      spaceNumber: session.space_number,
      numberPlate: session.number_plate,
      vehicleType: session.vehicle_type,
      checkInTime: session.check_in_time.toISOString(),
      accruedFee: accrued,
      cappedToday,
      overstay: session.is_overstay === 1,
      minutesOverCap,
    });
  }

  // Worst offenders first: formally flagged overstayers, then capped, then
  // longest past the cap.
  atRiskDetail.sort((a, b) => {
    if (a.overstay !== b.overstay) return a.overstay ? -1 : 1;
    if (a.cappedToday !== b.cappedToday) return a.cappedToday ? -1 : 1;
    return (b.minutesOverCap ?? 0) - (a.minutesOverCap ?? 0);
  });

  const streams: RevenueStream[] = [
    {
      key: "parking",
      label: "Transient parking",
      amount: round2(collectedToday),
      sessions: sessionsToday,
    },
    {
      // Enforcement streams are wired up in later phases; reporting them as
      // zero rather than omitting them keeps the breakdown honest about what
      // the business is not yet earning.
      key: "overstay",
      label: "Overstay penalties",
      amount: 0,
      sessions: 0,
    },
    {
      key: "towing",
      label: "Towing & impound",
      amount: 0,
      sessions: 0,
    },
  ];

  return {
    currency,
    collectedToday: round2(collectedToday),
    sessionsToday,
    averageTicket,
    yieldPerSpace: totalSpaces === 0 ? 0 : round2(collectedToday / totalSpaces),
    atRisk: round2(atRisk),
    atRiskVehicles: active.length,
    cappedExposure: round2(cappedExposure),
    overstayTargets,
    streams,
    hourlyToday: hourly.map((bucket, hour) => ({
      hour,
      revenue: round2(bucket.revenue),
      sessions: bucket.sessions,
    })),
    atRiskDetail,
  };
}