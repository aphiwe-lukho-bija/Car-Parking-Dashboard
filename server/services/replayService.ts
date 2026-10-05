import type { RowDataPacket } from "mysql2";
import type { ReplayDto, ReplayFrame } from "../../shared/types";
import { query } from "../config/db";
import { getPricingRules } from "./pricingService";

interface SessionRow extends RowDataPacket {
  check_in_time: Date;
  check_out_time: Date | null;
  space_number: string;
}

interface PaymentRow extends RowDataPacket {
  amount: number;
  paid_at: Date;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const DAY_START = 0;
const DAY_END = 24 * 60;

/**
 * Resolves a requested `YYYY-MM-DD` to local midnight, or local today when the
 * caller passes nothing.
 *
 * Parsed from the date parts rather than by `new Date(string)`, because that
 * constructor treats a bare date as UTC midnight and would shift the replay a
 * day in a timezone behind UTC — which is exactly where this facility sits.
 */
export function resolveReplayDay(date: string | undefined, now: Date): Date {
  if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  const [year, month, day] = date.split("-").map(Number);
if (year === undefined || month === undefined || day === undefined) return startOf(now);

  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? startOf(now) : parsed;
}

const startOf = (now: Date): Date =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate());

/**
 * Reconstructs a whole operating day from the session and payment ledgers.
 *
 * Occupancy is not read from a stored series because none exists: it is derived
 * from the session timestamps, which are immutable and therefore the more
 * trustworthy source. Every session that overlaps the window contributes a
 * departure-free interval if it is still open, so a car that parked yesterday
 * and is still sitting there correctly occupies a bay for the entire replay.
 *
 * The timeline is walked once, accumulating arrivals and departures, so the
 * cost is linear in sessions rather than one query per frame.
 */
export async function getDayReplay(
  date: string | undefined,
  now = new Date(),
  stepMinutes = 15,
): Promise<ReplayDto> {
  const dayStart = resolveReplayDay(date, now);
  const dayEnd = new Date(dayStart.getTime() + DAY_END * 60_000);

  // Guard against a caller asking for thousands of frames and locking the box up.
  const step = Math.min(60, Math.max(5, Math.trunc(stepMinutes)));

  const [sessions, payments, rules, spaceRows] = await Promise.all([
    query<SessionRow>(
      `SELECT s.check_in_time, s.check_out_time, sp.space_number
         FROM parking_sessions s
         JOIN parking_spaces sp ON sp.id = s.parking_space_id
        WHERE s.check_in_time < ?
          AND (s.check_out_time IS NULL OR s.check_out_time > ?)`,
      [dayEnd, dayStart],
    ),
    query<PaymentRow>(
      `SELECT amount, paid_at
         FROM payments
        WHERE status = 'paid'
          AND paid_at IS NOT NULL
          AND paid_at >= ?
          AND paid_at < ?`,
      [dayStart, dayEnd],
    ),
    getPricingRules(),
    query<RowDataPacket & { total: number }>(
      `SELECT COUNT(*) AS total FROM parking_spaces`,
    ),
  ]);

  const capacity = Number(spaceRows[0]?.total ?? 0);
  const currency = rules[0]?.currency ?? "ZAR";

  // ---- Movements, sorted so the sweep below can stay a single pass ---------
  interface Movement {
    at: number;
    space: string;
    kind: "arrival" | "departure";
  }

  const movements: Movement[] = [];

  for (const session of sessions) {
    const inAt = session.check_in_time.getTime();
    if (inAt >= dayStart.getTime() && inAt < dayEnd.getTime()) {
      movements.push({ at: inAt, space: session.space_number, kind: "arrival" });
    }

    const outAt = session.check_out_time?.getTime() ?? null;
    if (outAt !== null && outAt >= dayStart.getTime() && outAt < dayEnd.getTime()) {
      movements.push({ at: outAt, space: session.space_number, kind: "departure" });
    }
  }

  movements.sort((a, b) => a.at - b.at);

  // ---- Occupancy that already existed at midnight --------------------------
  // A session that started before today and has not yet left is on site for the
  // whole window, so it seeds the set rather than appearing at its check-in.
  const bays = new Set<string>();
  for (const session of sessions) {
    if (session.check_in_time.getTime() < dayStart.getTime()) {
      bays.add(session.space_number);
    }
  }

  const paidSorted = [...payments].sort(
    (a, b) => a.paid_at.getTime() - b.paid_at.getTime(),
  );

  const frames: ReplayFrame[] = [];
  const stepMs = step * 60_000;
  const dayEndMs = dayEnd.getTime();

  let movementIndex = 0;
  let paymentIndex = 0;
  let revenue = 0;

  let peakOccupancy = bays.size;
  let peakAt: string | null = null;

  for (
    let cursor = dayStart.getTime() + DAY_START * 60_000;
    cursor <= dayEndMs;
    cursor += stepMs
  ) {
    // Apply everything that happened since the previous frame.
    let arrivals = 0;
    let departures = 0;

    while (movementIndex < movements.length) {
      const movement = movements[movementIndex];
      if (movement === undefined || movement.at > cursor) break;

      if (movement.kind === "arrival") {
        bays.add(movement.space);
        arrivals += 1;
      } else {
        bays.delete(movement.space);
        departures += 1;
      }

      movementIndex += 1;
    }

    while (paymentIndex < paidSorted.length) {
      const payment = paidSorted[paymentIndex];
      if (payment === undefined || payment.paid_at.getTime() > cursor) break;

      revenue += Number(payment.amount ?? 0);
      paymentIndex += 1;
    }

    if (bays.size > peakOccupancy) {
      peakOccupancy = bays.size;
      peakAt = new Date(cursor).toISOString();
    }

    frames.push({
      at: new Date(cursor).toISOString(),
      occupied: bays.size,
      capacity,
      revenue: round2(revenue),
      bays: [...bays].sort(),
      arrivals,
      departures,
    });
  }

  // ---- Busiest bay, ranked by hours actually held on site ----------------
  // Dwell is measured per session and clipped to the window, so a car that
  // parked yesterday and left this morning is credited only for today's hours
  // and cannot make its bay look like the busiest one.
  const perBay = new Map<string, { sessions: number; ms: number }>();

  for (const session of sessions) {
    const inAt = Math.max(session.check_in_time.getTime(), dayStart.getTime());
    const outAt = Math.min(session.check_out_time?.getTime() ?? now.getTime(), dayEndMs);

    if (outAt <= inAt) continue;

    const tally = perBay.get(session.space_number) ?? { sessions: 0, ms: 0 };
    tally.sessions += 1;
    tally.ms += outAt - inAt;
    perBay.set(session.space_number, tally);
  }

  let busiestBay: ReplayDto["busiestBay"] = null;
  for (const [spaceNumber, tally] of perBay) {
    const candidate = {
      spaceNumber,
      sessions: tally.sessions,
      hours: round2(tally.ms / 3_600_000),
    };

    if (
      busiestBay === null ||
      candidate.hours > busiestBay.hours ||
      (candidate.hours === busiestBay.hours && candidate.sessions > busiestBay.sessions)
    ) {
      busiestBay = candidate;
    }
  }

  const isToday = dayStart.getTime() === startOf(now).getTime();

  return {
    date: `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, "0")}-${String(dayStart.getDate()).padStart(2, "0")}`,
    stepMinutes: step,
    currency,
    frames,
    totalRevenue: round2(revenue),
    totalSessions: payments.length,
    peakOccupancy,
    peakAt,
    // Only today can be scrubbed forward into the live present.
    live: isToday,
    busiestBay,
  };
}