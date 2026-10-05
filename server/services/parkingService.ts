import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { calculateParkingFee } from "../../shared/pricing";
import { paymentReference } from "../../shared/references";
import { resolveRateCard } from "../../shared/pricingRules";
import type {
  FacilityDto,
  LotStatsDto,
  ParkingSessionDto,
  ParkingSpaceDto,
  PricingRule,
  RateCard,
  SessionStatus,
  SpaceStatus,
  VehicleDto,
  VehicleType,
} from "../../shared/types";
import { query, queryOne, withTransaction } from "../config/db";
import { AppError } from "../errors";
import { getPricingRules, getRateCard } from "./pricingService";

/* ------------------------------------------------------------------ */
/* Row shapes                                                           */
/* ------------------------------------------------------------------ */

interface SpaceRow extends RowDataPacket {
  id: number;
  space_number: string;
  section: string;
  type: VehicleType;
  status: SpaceStatus;
  vehicle_id: number | null;
  number_plate: string | null;
  vehicle_type: VehicleType | null;
  session_id: number | null;
  check_in_time: Date | null;
  is_overstay: number | null;
}

interface StatsRow extends RowDataPacket {
  total: number;
  occupied: number;
  reserved: number;
  active_sessions: number;
  revenue_today: number;
  average_stay_minutes: number;
}

interface FacilityRow extends RowDataPacket {
  name: string;
  city: string;
  currency: string;
  timezone: string;
}

interface ActiveSessionRow extends RowDataPacket {
  session_id: number;
  check_in_time: Date;
  fee: number | null;
  number_plate: string;
  vehicle_type: VehicleType;
}

/* ------------------------------------------------------------------ */
/* Mapping                                                              */
/* ------------------------------------------------------------------ */

/**
 * Derives the live fee for an open session.
 *
 * `minutesToCap` is expressed in whole hours still available before the daily
 * maximum is reached: a started-hour tariff means a partial hour is billed in
 * full, so anything finer grained than 60 minutes would be misleading.
 */
function buildSession(
  base: {
    id: number;
    spaceNumber: string;
    vehicle: VehicleDto;
    checkInTime: Date;
    checkOutTime: Date | null;
    status: SessionStatus;
    finalFee: number | null;
    isOverstay?: boolean;
  },
  rules: readonly PricingRule[],
  now: Date,
): ParkingSessionDto {
  const rateCard = resolveRateCard(base.vehicle.type, rules);
  const settledAt = base.checkOutTime ?? now;

  const breakdown = calculateParkingFee({
    checkInTime: base.checkInTime,
    checkOutTime: settledAt,
    rule: rateCard,
  });

  const capped = breakdown.cappedDays > 0;
  const hoursUnderCap = Math.floor(rateCard.dailyMaximum / rateCard.hourlyRate);
  const chargedHours = breakdown.lines.reduce(
    (sum, line) => sum + line.hoursCharged,
    0,
  );

  return {
    id: base.id,
    spaceNumber: base.spaceNumber,
    vehicle: base.vehicle,
    checkInTime: base.checkInTime.toISOString(),
    checkOutTime: base.checkOutTime?.toISOString() ?? null,
    runningFee: breakdown.totalFee,
    finalFee: base.finalFee,
    status: base.status,
    overGrace:
      settledAt.getTime() - base.checkInTime.getTime() >
      rateCard.gracePeriodMinutes * 60_000,
    nearCap: capped,
    minutesToCap: capped ? 0 : Math.max(0, hoursUnderCap - chargedHours) * 60,
    // Formally flagged for enforcement, distinct from merely being overdue.
    isOverstay: base.isOverstay ?? false,
  };
}

function buildSpace(
  row: SpaceRow,
  rules: readonly PricingRule[],
  now: Date,
): ParkingSpaceDto {
  const vehicle =
    row.vehicle_id !== null && row.number_plate !== null
      ? {
          id: row.vehicle_id,
          numberPlate: row.number_plate,
          type: row.vehicle_type ?? row.type,
        }
      : null;

  const session =
    row.session_id !== null && row.check_in_time !== null && vehicle !== null
      ? buildSession(
          {
            id: row.session_id,
            spaceNumber: row.space_number,
            vehicle,
            checkInTime: row.check_in_time,
            checkOutTime: null,
            status: "active",
            finalFee: null,
            isOverstay: row.is_overstay === 1,
          },
          rules,
          now,
        )
      : null;

  return {
    id: row.id,
    spaceNumber: row.space_number,
    section: row.section,
    type: row.type,
    status: row.status,
    vehicle,
    session,
  };
}

/* ------------------------------------------------------------------ */
/* Queries                                                              */
/* ------------------------------------------------------------------ */

const SPACE_QUERY = `
  SELECT
    s.id, s.space_number, s.section, s.type, s.status,
    v.id       AS vehicle_id,
    v.number_plate,
    v.type     AS vehicle_type,
    sess.id      AS session_id,
    sess.check_in_time,
    sess.is_overstay
  FROM parking_spaces s
  LEFT JOIN parking_sessions sess
         ON sess.parking_space_id = s.id AND sess.status = 'active'
  LEFT JOIN vehicles v
         ON v.id = sess.vehicle_id`;

/** Bay ordering, kept separate so callers can append their own WHERE clause. */
const SPACE_ORDER = " ORDER BY s.section, s.ordinal";

const STATS_QUERY = `
  SELECT
    (SELECT COUNT(*) FROM parking_spaces)                             AS total,
    (SELECT COUNT(*) FROM parking_spaces WHERE status = 'occupied')  AS occupied,
    (SELECT COUNT(*) FROM parking_spaces WHERE status = 'reserved')  AS reserved,
    (SELECT COUNT(*) FROM parking_sessions WHERE status = 'active')  AS active_sessions,
    (SELECT COALESCE(SUM(amount), 0) FROM payments
      WHERE status = 'paid' AND paid_at >= CURDATE())                AS revenue_today,
    (SELECT COALESCE(AVG(TIMESTAMPDIFF(MINUTE, check_in_time, check_out_time)), 0)
       FROM parking_sessions
      WHERE status = 'completed' AND check_out_time >= CURDATE())    AS average_stay_minutes`;

export async function getFacility(): Promise<FacilityDto> {
  const row = await queryOne<FacilityRow>(
    "SELECT name, city, currency, timezone FROM facility WHERE id = 1",
  );

  return (
    row ?? {
      name: "Apex Park",
      city: "Cape Town",
      currency: "ZAR",
      timezone: "Africa/Johannesburg",
    }
  );
}

export async function getSpaces(now = new Date()): Promise<ParkingSpaceDto[]> {
  const [rows, rules] = await Promise.all([
    query<SpaceRow>(`${SPACE_QUERY}${SPACE_ORDER}`),
    getPricingRules(),
  ]);

  return rows.map((row) => buildSpace(row, rules, now));
}

export async function getLotStats(
  spaces: readonly ParkingSpaceDto[],
): Promise<LotStatsDto> {
  const row = await queryOne<StatsRow>(STATS_QUERY);

  const total = spaces.length > 0 ? spaces.length : Number(row?.total ?? 0);
  const occupied = spaces.filter((space) => space.status === "occupied").length;
  const reserved = spaces.filter((space) => space.status === "reserved").length;
  const revenueToday = Number(row?.revenue_today ?? 0);

  return {
    total,
    occupied,
    reserved,
    available: total - occupied - reserved,
    occupancyRate: total === 0 ? 0 : Math.round((occupied / total) * 100),
    // Derived from the same bay list as `occupied`, so the two can never
    // disagree if a session is ever left dangling by a failed transaction.
    activeSessions: spaces.filter((space) => space.session !== null).length,
    revenueToday,
    averageStayMinutes: Math.round(Number(row?.average_stay_minutes ?? 0)),
    overstayCount: spaces.filter((space) => space.session?.overGrace).length,
    revenuePerSpace: total === 0 ? 0 : Math.round((revenueToday / total) * 100) / 100,
  };
}

export async function getPricingRuleList(): Promise<PricingRule[]> {
  return getPricingRules();
}

/* ------------------------------------------------------------------ */
/* Mutations                                                            */
/* ------------------------------------------------------------------ */

async function findSpaceRow(
  connection: PoolConnection | null,
  spaceNumber: string,
): Promise<SpaceRow> {
  const sql = `
    SELECT
      s.id, s.space_number, s.section, s.type, s.status,
      v.id AS vehicle_id, v.number_plate, v.type AS vehicle_type,
      sess.id AS session_id, sess.check_in_time
    FROM parking_spaces s
    LEFT JOIN parking_sessions sess
           ON sess.parking_space_id = s.id AND sess.status = 'active'
    LEFT JOIN vehicles v ON v.id = sess.vehicle_id
    WHERE s.space_number = ?
    FOR UPDATE`;

  const rows = connection
    ? (await connection.query<SpaceRow[]>(sql, [spaceNumber]))[0]
    : await query<SpaceRow>(sql, [spaceNumber]);

  const row = rows[0];
  if (row === undefined) {
    throw AppError.notFound(`Bay ${spaceNumber} does not exist`);
  }
  return row;
}

/** Finds or creates the vehicle record for a plate. */
async function upsertVehicle(
  connection: PoolConnection,
  numberPlate: string,
  type: VehicleType,
): Promise<number> {
  const [existing] = await connection.query<RowDataPacket[]>(
    "SELECT id FROM vehicles WHERE number_plate = ? FOR UPDATE",
    [numberPlate],
  );

  const found = existing[0];
  if (found !== undefined) {
    // The type can legitimately change between visits (a hatchback traded for
    // an SUV), and pricing follows the vehicle, not the plate.
    await connection.query("UPDATE vehicles SET type = ? WHERE id = ?", [
      type,
      found.id,
    ]);
    return found.id as number;
  }

  const [result] = await connection.execute<ResultSetHeader>(
    "INSERT INTO vehicles (number_plate, type) VALUES (?, ?)",
    [numberPlate, type],
  );

  return result.insertId;
}

export interface CheckInResult {
  session: ParkingSessionDto;
  space: ParkingSpaceDto;
}

export async function checkIn(
  spaceNumber: string,
  numberPlate: string,
  vehicleType: VehicleType,
  now = new Date(),
): Promise<CheckInResult> {
  const sessionId = await withTransaction(async (connection) => {
    const space = await findSpaceRow(connection, spaceNumber);

    if (space.session_id !== null) {
      throw AppError.conflict(
        "bay_occupied",
        `Bay ${spaceNumber} already has a vehicle in it`,
      );
    }
    if (space.status === "reserved") {
      throw AppError.conflict(
        "bay_reserved",
        `Bay ${spaceNumber} is reserved and cannot be used`,
      );
    }

    const vehicleId = await upsertVehicle(connection, numberPlate, vehicleType);

    await connection.query(
      "UPDATE parking_spaces SET status = 'occupied' WHERE id = ?",
      [space.id],
    );

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO parking_sessions (vehicle_id, parking_space_id, check_in_time, status)
       VALUES (?, ?, ?, 'active')`,
      [vehicleId, space.id, now],
    );

    return result.insertId;
  });

  return getSessionWithSpace(sessionId, now);
}

export interface CheckoutResult {
  session: ParkingSessionDto;
  space: ParkingSpaceDto;
  payment: {
    id: number;
    sessionId: number;
    amount: number;
    method: "card" | "cash";
    status: "paid";
    reference: string;
    paidAt: string;
  };
}

export async function checkOut(
  spaceNumber: string,
  method: "card" | "cash" = "card",
  now = new Date(),
): Promise<CheckoutResult> {
  const settled = await withTransaction(async (connection) => {
    const space = await findSpaceRow(connection, spaceNumber);

    if (space.session_id === null || space.check_in_time === null) {
      throw AppError.conflict(
        "bay_empty",
        `Bay ${spaceNumber} has no vehicle to check out`,
      );
    }

    const rateCard = await getRateCard(space.vehicle_type ?? space.type);
    const breakdown = calculateParkingFee({
      checkInTime: space.check_in_time,
      checkOutTime: now,
      rule: rateCard,
    });

    await connection.query(
      `UPDATE parking_sessions
          SET check_out_time = ?, status = 'completed', fee = ?
        WHERE id = ?`,
      [now, breakdown.totalFee, space.session_id],
    );

    await connection.query(
      "UPDATE parking_spaces SET status = 'available' WHERE id = ?",
      [space.id],
    );

    const reference = paymentReference(space.session_id, now);

    const [payment] = await connection.execute<ResultSetHeader>(
      `INSERT INTO payments (session_id, amount, method, status, reference, paid_at)
       VALUES (?, ?, ?, 'paid', ?, ?)`,
      [space.session_id, breakdown.totalFee, method, reference, now],
    );

    return {
      sessionId: space.session_id as number,
      spaceNumber,
      plate: space.number_plate as string,
      vehicleType: (space.vehicle_type ?? space.type) as VehicleType,
      checkInTime: space.check_in_time,
      amount: breakdown.totalFee,
      reference,
      paidAt: now,
      paymentId: payment.insertId,
    };
  });

  const rules = await getPricingRules();
  const space = await getSpaceByNumber(spaceNumber, now);

  return {
    session: buildSession(
      {
        id: settled.sessionId,
        spaceNumber: settled.spaceNumber,
        vehicle: {
          id: 0,
          numberPlate: settled.plate,
          type: settled.vehicleType,
        },
        checkInTime: settled.checkInTime,
        checkOutTime: settled.paidAt,
        status: "completed",
        finalFee: settled.amount,
      },
      rules,
      now,
    ),
    space,
    payment: {
      id: settled.paymentId,
      sessionId: settled.sessionId,
      amount: settled.amount,
      method,
      status: "paid",
      reference: settled.reference,
      paidAt: settled.paidAt.toISOString(),
    },
  };
}

async function getSessionWithSpace(
  sessionId: number,
  now: Date,
): Promise<CheckInResult> {
  const [rows, rules] = await Promise.all([
    query<SpaceRow>(
      `${SPACE_QUERY} WHERE s.id = (
         SELECT parking_space_id FROM parking_sessions WHERE id = ?
       )`,
      [sessionId],
    ),
    getPricingRules(),
  ]);

  const row = rows[0];
  if (row === undefined) {
    throw AppError.notFound(`Session ${sessionId} not found`);
  }

  return {
    session: buildSession(
      {
        id: row.session_id as number,
        spaceNumber: row.space_number,
        vehicle: {
          id: row.vehicle_id as number,
          numberPlate: row.number_plate as string,
          type: (row.vehicle_type ?? row.type) as VehicleType,
        },
        checkInTime: row.check_in_time as Date,
        checkOutTime: null,
        status: "active",
        finalFee: null,
        isOverstay: row.is_overstay === 1,
      },
      rules,
      now,
    ),
    space: buildSpace(row, rules, now),
  };
}

export async function getSpaceByNumber(
  spaceNumber: string,
  now = new Date(),
): Promise<ParkingSpaceDto> {
  const rows = await query<SpaceRow>(
    `${SPACE_QUERY} WHERE s.space_number = ?`,
    [spaceNumber],
  );
  const row = rows[0];
  if (row === undefined) {
    throw AppError.notFound(`Bay ${spaceNumber} does not exist`);
  }

  return buildSpace(row, await getPricingRules(), now);
}

export interface SessionHistoryRow extends RowDataPacket {
  id: number;
  space_number: string;
  number_plate: string;
  vehicle_type: VehicleType;
  check_in_time: Date;
  check_out_time: Date | null;
  fee: number | null;
  status: SessionStatus;
}

export async function getSessionHistory(limit = 50): Promise<SessionHistoryRow[]> {
  return query<SessionHistoryRow>(
    `SELECT s.id, sp.space_number, v.number_plate, v.type AS vehicle_type,
            s.check_in_time, s.check_out_time, s.fee, s.status
       FROM parking_sessions s
       JOIN parking_spaces sp ON sp.id = s.parking_space_id
       JOIN vehicles v ON v.id = s.vehicle_id
      ORDER BY COALESCE(s.check_out_time, s.check_in_time) DESC
      LIMIT ?`,
    [limit],
  );
}

export async function getRandomOccupiableSpace(
  excludeIds: readonly number[] = [],
): Promise<SpaceRow | null> {
  const params: number[] = [];
  let filter = "";
  if (excludeIds.length > 0) {
    filter = `AND s.id NOT IN (${excludeIds.map(() => "?").join(", ")})`;
    params.push(...excludeIds);
  }

  return queryOne<SpaceRow>(
    `SELECT s.id, s.space_number, s.section, s.type, s.status,
            NULL AS vehicle_id, NULL AS number_plate, NULL AS vehicle_type,
            NULL AS session_id, NULL AS check_in_time
       FROM parking_spaces s
      WHERE s.status = 'available' ${filter}
      ORDER BY RAND()
      LIMIT 1`,
    params,
  );
}

/**
 * Oldest active sessions, oldest first. The simulator picks from this list at
 * random so departures skew towards vehicles that have been parked a while,
 * which is what actually generates revenue instead of churn.
 */
export async function getOldestActiveSessions(
  limit = 40,
): Promise<ActiveSessionRow[]> {
  return query<ActiveSessionRow>(
    `SELECT sess.id AS session_id, sess.check_in_time, sess.fee,
            v.number_plate, v.type AS vehicle_type
       FROM parking_sessions sess
       JOIN vehicles v ON v.id = sess.vehicle_id
      WHERE sess.status = 'active'
        -- Overstay candidates are deliberately withheld from the simulator's
        -- turnover pool: one of them is kept on site at all times so the
        -- enforcement and towing flow always has a live subject to show.
        AND sess.is_overstay = 0
      ORDER BY sess.check_in_time ASC
      LIMIT ?`,
    [limit],
  );
}

export interface VehicleRow extends RowDataPacket {
  id: number;
  number_plate: string;
  type: VehicleType;
}

export async function getVehicles(limit = 500): Promise<VehicleRow[]> {
  return query<VehicleRow>(
    "SELECT id, number_plate, type FROM vehicles ORDER BY id LIMIT ?",
    [limit],
  );
}

export async function getActiveSessionBySpace(
  spaceNumber: string,
): Promise<ActiveSessionRow | null> {
  return queryOne<ActiveSessionRow>(
    `SELECT sess.id AS session_id, sess.check_in_time, sess.fee,
            v.number_plate, v.type AS vehicle_type
       FROM parking_sessions sess
       JOIN parking_spaces sp ON sp.id = sess.parking_space_id
       JOIN vehicles v ON v.id = sess.vehicle_id
      WHERE sess.status = 'active' AND sp.space_number = ?
      LIMIT 1`,
    [spaceNumber],
  );
}

export async function recordOccupancySnapshot(
  now = new Date(),
): Promise<void> {
  const row = await queryOne<StatsRow>(STATS_QUERY);
  const total = Number(row?.total ?? 0);
  const occupied = Number(row?.occupied ?? 0);
  const revenue = Number(row?.revenue_today ?? 0);

  await query(
    `INSERT INTO occupancy_snapshots (recorded_at, occupied, total, revenue_today)
     VALUES (?, ?, ?, ?)`,
    [now, occupied, total, revenue],
  );
}

export type { RateCard };