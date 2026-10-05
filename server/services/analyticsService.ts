import type { RowDataPacket } from "mysql2";
import type {
  AnalyticsDto,
  DurationBucket,
  PeakHourPoint,
  RevenuePoint,
  VehicleMixPoint,
  VehicleType,
} from "../../shared/types";
import { query } from "../config/db";

interface SnapshotRow extends RowDataPacket {
  recorded_at: Date;
  occupied: number;
  total: number;
}

interface SessionStatRow extends RowDataPacket {
  check_in_time: Date;
  check_out_time: Date;
  fee: number | null;
  vehicle_type: VehicleType;
}

const HISTORY_DAYS = 14;

const DURATION_BUCKETS: readonly DurationBucket[] = [
  { label: "< 15m", count: 0 },
  { label: "15–60m", count: 0 },
  { label: "1–2h", count: 0 },
  { label: "2–4h", count: 0 },
  { label: "4–8h", count: 0 },
  { label: "8–24h", count: 0 },
  { label: "> 24h", count: 0 },
];

function bucketFor(minutes: number): number {
  if (minutes < 15) return 0;
  if (minutes < 60) return 1;
  if (minutes < 120) return 2;
  if (minutes < 240) return 3;
  if (minutes < 480) return 4;
  if (minutes < 1440) return 5;
  return 6;
}

const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Average number of vehicles on site for each hour of the day.
 *
 * Derived from interval overlap rather than arrival counts, so a session that
 * spans three days contributes to 72 separate hours, which is what an operator
 * asking "when is the lot busiest" actually wants to know.
 */
function buildPeakHours(
  sessions: readonly SessionStatRow[],
  totalSpaces: number,
): PeakHourPoint[] {
  const totals = new Array<number>(24).fill(0);
  const days = new Set<string>();

  for (const session of sessions) {
    days.add(dayKey(session.check_in_time));

    const cursor = new Date(session.check_in_time);
    cursor.setMinutes(0, 0, 0);
    const end = session.check_out_time.getTime();

    while (cursor.getTime() < end) {
      totals[cursor.getHours()] = (totals[cursor.getHours()] ?? 0) + 1;
      cursor.setHours(cursor.getHours() + 1);
    }
  }

  const dayCount = Math.max(1, days.size);
  const capacity = dayCount * Math.max(1, totalSpaces);

  return totals.map((count, hour) => ({
    hour,
    occupancyRate: Math.min(100, Math.round((count / capacity) * 100)),
  }));
}

export async function getAnalytics(
  now = new Date(),
  totalSpaces = 1,
): Promise<AnalyticsDto> {
  const historySince = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);

  const [snapshots, sessions] = await Promise.all([
    query<SnapshotRow>(
      `SELECT recorded_at, occupied, total
         FROM occupancy_snapshots
        WHERE recorded_at >= ?
        ORDER BY recorded_at`,
      [new Date(now.getTime() - 24 * 3_600_000)],
    ),
    query<SessionStatRow>(
      `SELECT s.check_in_time, s.check_out_time, s.fee, v.type AS vehicle_type
         FROM parking_sessions s
         JOIN vehicles v ON v.id = s.vehicle_id
        WHERE s.status = 'completed'
          AND s.check_out_time >= ?
          AND s.check_out_time IS NOT NULL`,
      [historySince],
    ),
  ]);

  const revenueByDay = new Map<string, { revenue: number; sessions: number }>();
  const mix = new Map<VehicleType, number>();
  const buckets = DURATION_BUCKETS.map((bucket) => ({ ...bucket }));
  let totalRevenue = 0;

  for (const session of sessions) {
    const fee = Number(session.fee ?? 0);
    const key = dayKey(session.check_out_time);

    const entry = revenueByDay.get(key) ?? { revenue: 0, sessions: 0 };
    entry.revenue += fee;
    entry.sessions += 1;
    revenueByDay.set(key, entry);

    mix.set(session.vehicle_type, (mix.get(session.vehicle_type) ?? 0) + 1);

    const minutes = (session.check_out_time.getTime() - session.check_in_time.getTime()) / 60_000;
    const bucket = buckets[bucketFor(minutes)];
    if (bucket !== undefined) bucket.count += 1;

    totalRevenue += fee;
  }

  // Emit every day in the window, including days with no sessions, so the
  // revenue chart has a continuous x-axis instead of collapsing gaps.
  const revenueSeries: RevenuePoint[] = [];
  for (let offset = HISTORY_DAYS - 1; offset >= 0; offset -= 1) {
    const key = dayKey(new Date(now.getTime() - offset * 86_400_000));
    const entry = revenueByDay.get(key);
    revenueSeries.push({
      date: key,
      revenue: Math.round((entry?.revenue ?? 0) * 100) / 100,
      sessions: entry?.sessions ?? 0,
    });
  }

  const vehicleMix: VehicleMixPoint[] = [...mix.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    occupancyHistory: snapshots.map((snapshot) => ({
      at: snapshot.recorded_at.toISOString(),
      occupancyRate:
        snapshot.total === 0
          ? 0
          : Math.round((snapshot.occupied / snapshot.total) * 100),
    })),
    revenueByDay: revenueSeries,
    peakHours: buildPeakHours(sessions, totalSpaces),
    durationBuckets: buckets,
    vehicleMix,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalSessions: sessions.length,
  };
}