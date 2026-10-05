import type { RateCard } from "./types";

const MS_PER_MINUTE = 60_000;

export interface FeeLine {
  /** Local calendar day this segment belongs to, as YYYY-MM-DD. */
  date: string;
  minutes: number;
  hoursCharged: number;
  amount: number;
  /** True when the daily maximum replaced the raw hourly total. */
  capped: boolean;
  /**
   * The moment the daily cap was reached on this day, or null when the day
   * stayed under it. Callers use this to work out how long a vehicle has been
   * parked past the point where it stopped being worth charging for.
   */
  cappedAt: Date | null;
}

export interface ParkingFeeBreakdown {
  totalFee: number;
  currency: string;
  graceApplied: boolean;
  totalMinutes: number;
  cappedDays: number;
  lines: FeeLine[];
}

export interface ParkingFeeInput {
  checkInTime: Date;
  checkOutTime: Date;
  rule: RateCard;
}

interface DaySegment {
  start: Date;
  end: Date;
}

/**
 * A stay is billed per calendar day, not as one continuous duration.
 *
 * The naive approach of capping the whole stay at one day's maximum means a
 * three-day stay costs exactly the same as a two-hour one. Splitting on local
 * midnight keeps the daily maximum meaningful.
 */
function splitByCalendarDay(checkInTime: Date, checkOutTime: Date): DaySegment[] {
  const segments: DaySegment[] = [];
  let start = new Date(checkInTime.getTime());

  while (start.getTime() < checkOutTime.getTime()) {
    // Constructing from (y, m, d + 1) rolls over correctly across month and
    // year boundaries, and stays correct through DST shifts.
    const nextDayStart = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + 1,
    );

    const end =
      nextDayStart.getTime() < checkOutTime.getTime() ? nextDayStart : checkOutTime;

    segments.push({ start, end });
    start = new Date(end.getTime());
  }

  return segments;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function calculateParkingFee({
  checkInTime,
  checkOutTime,
  rule,
}: ParkingFeeInput): ParkingFeeBreakdown {
  const totalMinutes =
    (checkOutTime.getTime() - checkInTime.getTime()) / MS_PER_MINUTE;

  if (totalMinutes < 0) {
    throw new Error("Check-out time cannot be before check-in time.");
  }

  const shared = {
    currency: rule.currency,
    totalMinutes,
  };

  // The grace window applies once to the whole stay: leave within the grace
  // period and the visit is free, regardless of which day it spans.
  if (totalMinutes <= rule.gracePeriodMinutes) {
    return { ...shared, totalFee: 0, graceApplied: true, cappedDays: 0, lines: [] };
  }

  const lines: FeeLine[] = splitByCalendarDay(checkInTime, checkOutTime).map(
    ({ start, end }) => {
      const minutes = (end.getTime() - start.getTime()) / MS_PER_MINUTE;
      // Started-hour rule: 61 minutes bills as 2 hours.
      const hoursCharged = Math.ceil(minutes / 60);
      const rawAmount = hoursCharged * rule.hourlyRate;
      const amount = Math.min(rawAmount, rule.dailyMaximum);
      const capped = rawAmount > rule.dailyMaximum;

      // The cap bites at the start of the first charged hour that would have
      // taken the day over the maximum.
      const hoursUnderCap = Math.floor(rule.dailyMaximum / rule.hourlyRate);

      return {
        date: toDateKey(start),
        minutes,
        hoursCharged,
        amount,
        capped,
        cappedAt: capped
          ? new Date(start.getTime() + hoursUnderCap * 60 * MS_PER_MINUTE)
          : null,
      };
    },
  );

  return {
    ...shared,
    totalFee: lines.reduce((sum, line) => sum + line.amount, 0),
    graceApplied: false,
    cappedDays: lines.filter((line) => line.capped).length,
    lines,
  };
}