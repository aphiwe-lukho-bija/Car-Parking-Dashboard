import type { RowDataPacket } from "mysql2";
import { query } from "../config/db";
import { checkIn, getSpaces } from "./parkingService";

interface OverstayerRow extends RowDataPacket {
  session_id: number;
  space_number: string;
  number_plate: string;
  vehicle_type: "car" | "suv" | "truck" | "motorbike";
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

/** Marker plate so the demo subject is instantly identifiable on the lot. */
const OVERSTAYER_PLATE = "CA 000 001";

/**
 * How far past its first day a held vehicle must be to qualify.
 *
 * Twenty-six hours guarantees it has breached a full daily maximum rather than
 * merely nudging past a grace period, which is the state a tow is justified for.
 */
const OVERSTAY_THRESHOLD_HOURS = 26;

/**
 * The timestamp a flagged vehicle is given: the configured number of hours ago
 * plus a half hour, so it is unambiguously past the limit rather than sitting
 * exactly on the boundary.
 */
const backdatedCheckIn = (now: Date): Date =>
  new Date(
    now.getTime() - OVERSTAY_THRESHOLD_HOURS * MS_PER_HOUR - 30 * MS_PER_MINUTE,
  );

const isBreached = (checkInTime: Date, now: Date): boolean =>
  now.getTime() - checkInTime.getTime() > OVERSTAY_THRESHOLD_HOURS * MS_PER_HOUR;

/**
 * Guarantees the lot always holds one vehicle that has blown past its stay
 * limit, so overstay enforcement and towing can always be demonstrated.
 *
 * If a flagged vehicle is already present it is refreshed rather than replaced,
 * which keeps the demo subject stable across runs instead of the car changing
 * every time someone happens to clear one.
 */
export async function ensureOverstayer(now = new Date()): Promise<boolean> {
  const existing = await query<OverstayerRow>(
    `SELECT sess.id AS session_id, sp.space_number, v.number_plate,
            v.type AS vehicle_type
       FROM parking_sessions sess
       JOIN vehicles v ON v.id = sess.vehicle_id
       JOIN parking_spaces sp ON sp.id = sess.parking_space_id
      WHERE sess.status = 'active' AND sess.is_overstay = 1
      LIMIT 1`,
  );

  const current = existing[0];
  if (current !== undefined) {
    // Already holding one. Refresh the age so it keeps drifting further past the
    // limit even if the process has been up for a long time.
    await query<RowDataPacket>(
      `UPDATE parking_sessions
          SET check_in_time = ?
        WHERE id = ? AND status = 'active'`,
      [backdatedCheckIn(now), current.session_id],
    );
    return false;
  }

  // None flagged: promote the longest-staying non-flagged session if it is
  // already well past the limit, otherwise stage a fresh arrival.
  const oldest = await query<OverstayerRow & { check_in_time: Date }>(
    `SELECT sess.id AS session_id, sess.check_in_time, sp.space_number,
            v.number_plate, v.type AS vehicle_type
       FROM parking_sessions sess
       JOIN vehicles v ON v.id = sess.vehicle_id
       JOIN parking_spaces sp ON sp.id = sess.parking_space_id
      WHERE sess.status = 'active' AND sess.is_overstay = 0
      ORDER BY sess.check_in_time ASC
      LIMIT 1`,
  );

  const candidate = oldest[0];
  if (candidate !== undefined && isBreached(candidate.check_in_time, now)) {
    await query<RowDataPacket>(
      `UPDATE parking_sessions
          SET check_in_time = ?, is_overstay = 1
        WHERE id = ?`,
      [backdatedCheckIn(now), candidate.session_id],
    );
    return true;
  }

  // Nothing is old enough, so park a dedicated vehicle and backdate it. A car
  // bay is preferred because it is the most legible vehicle type on the lot.
  const spaces = await getSpaces();
  const target =
    spaces.find((space) => space.status === "available" && space.type === "car") ??
    spaces.find((space) => space.status === "available");

  if (target === undefined) return false;

  await checkIn(target.spaceNumber, OVERSTAYER_PLATE, target.type);

  const staged = await query<OverstayerRow>(
    `SELECT sess.id AS session_id, sp.space_number, v.number_plate,
            v.type AS vehicle_type
       FROM parking_sessions sess
       JOIN vehicles v ON v.id = sess.vehicle_id
       JOIN parking_spaces sp ON sp.id = sess.parking_space_id
      WHERE sess.status = 'active' AND v.number_plate = ?
      LIMIT 1`,
    [OVERSTAYER_PLATE],
  );

  const session = staged[0];
  if (session === undefined) return false;

  await query<RowDataPacket>(
    `UPDATE parking_sessions
        SET check_in_time = ?, is_overstay = 1
      WHERE id = ?`,
    [backdatedCheckIn(now), session.session_id],
  );

  return true;
}

/**
 * The live overstay candidate, if there is one, with the money owed on it.
 *
 * Surfaced separately from generic revenue because this is the subject of the
 * enforcement story: the operator needs its plate, its bay and its accrued bill
 * in one place before deciding to tow.
 */
export async function getOverstayTargets(now = new Date()) {
  const rows = await query<OverstayerRow & { check_in_time: Date }>(
    `SELECT sess.id AS session_id, sess.check_in_time, sp.space_number,
            v.number_plate, v.type AS vehicle_type
       FROM parking_sessions sess
       JOIN vehicles v ON v.id = sess.vehicle_id
       JOIN parking_spaces sp ON sp.id = sess.parking_space_id
      WHERE sess.status = 'active' AND sess.is_overstay = 1
      ORDER BY sess.check_in_time ASC`,
  );

  return rows.map((row) => {
    const hours = (now.getTime() - row.check_in_time.getTime()) / MS_PER_HOUR;

    return {
      sessionId: row.session_id,
      spaceNumber: row.space_number,
      numberPlate: row.number_plate,
      vehicleType: row.vehicle_type,
      checkInTime: row.check_in_time.toISOString(),
      hoursOverstayed: Math.round(hours * 10) / 10,
    };
  });
}