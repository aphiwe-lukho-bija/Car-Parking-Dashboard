import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { calculateParkingFee } from "../../shared/pricing";
import { paymentReference } from "../../shared/references";
import type { VehicleType } from "../../shared/types";
import { withTransaction } from "../config/db";
import { AppError } from "../errors";
import { buildSession, getSpaceByNumber, type CheckoutResult } from "./parkingService";
import { getPricingRules, getRateCard } from "./pricingService";

/**
 * Flat charge raised when an overstay is removed from site.
 *
 * Settling the accrued parking is the outstanding balance the release is
 * conditional on; the tow fee is the enforcement action itself. Charged as one
 * payment against the session so the receipt tells the whole story of what the
 * operator recovered from the vehicle.
 */
export const TOW_RELEASE_FEE = 450;

const round2 = (value: number): number => Math.round(value * 100) / 100;

interface TowRow extends RowDataPacket {
  id: number;
  space_number: string;
  type: VehicleType;
  vehicle_id: number | null;
  number_plate: string | null;
  vehicle_type: VehicleType | null;
  session_id: number | null;
  check_in_time: Date | null;
  is_overstay: number | null;
}

/**
 * Removes a flagged overstayer from the lot and settles what it owes.
 *
 * The session is closed exactly the way a checkout closes it — same fee
 * engine, same one-payment-per-session guarantee — with two differences: the
 * bay must have been formally flagged for enforcement, and the payment is
 * booked against the towing stream so revenue reporting can tell an impound
 * settlement apart from transient parking.
 */
export async function authoriseTow(
  spaceNumber: string,
  now = new Date(),
): Promise<CheckoutResult> {
  const settled = await withTransaction(async (connection) => {
    const sql = `
      SELECT
        s.id, s.space_number, s.type,
        v.id AS vehicle_id, v.number_plate, v.type AS vehicle_type,
        sess.id AS session_id, sess.check_in_time, sess.is_overstay
      FROM parking_spaces s
      LEFT JOIN parking_sessions sess
             ON sess.parking_space_id = s.id AND sess.status = 'active'
      LEFT JOIN vehicles v ON v.id = sess.vehicle_id
      WHERE s.space_number = ?
      FOR UPDATE`;

    const [rows] = await connection.query<TowRow[]>(sql, [spaceNumber]);
    const space = rows[0];

    if (space === undefined) {
      throw AppError.notFound(`Bay ${spaceNumber} does not exist`);
    }
    if (space.session_id === null || space.check_in_time === null) {
      throw AppError.conflict(
        "bay_empty",
        `Bay ${spaceNumber} has no vehicle to tow`,
      );
    }
    if (space.is_overstay !== 1) {
      throw AppError.conflict(
        "not_flagged",
        `Bay ${spaceNumber} is not flagged for enforcement`,
      );
    }

    const rateCard = await getRateCard(space.vehicle_type ?? space.type);
    const breakdown = calculateParkingFee({
      checkInTime: space.check_in_time,
      checkOutTime: now,
      rule: rateCard,
    });

    const accrued = round2(breakdown.totalFee);
    const total = round2(accrued + TOW_RELEASE_FEE);

    await connection.query(
      `UPDATE parking_sessions
          SET check_out_time = ?, status = 'completed', fee = ?
        WHERE id = ?`,
      [now, accrued, space.session_id],
    );

    await connection.query(
      "UPDATE parking_spaces SET status = 'available' WHERE id = ?",
      [space.id],
    );

    const reference = paymentReference(space.session_id, now);

    const [payment] = await connection.execute<ResultSetHeader>(
      `INSERT INTO payments (session_id, amount, method, status, kind, reference, paid_at)
       VALUES (?, ?, 'card', 'paid', 'towing', ?, ?)`,
      [space.session_id, total, reference, now],
    );

    return {
      sessionId: space.session_id as number,
      spaceNumber: space.space_number,
      plate: space.number_plate as string,
      vehicleType: (space.vehicle_type ?? space.type) as VehicleType,
      checkInTime: space.check_in_time,
      accrued,
      total,
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
        finalFee: settled.total,
      },
      rules,
      now,
    ),
    space,
    payment: {
      id: settled.paymentId,
      sessionId: settled.sessionId,
      amount: settled.total,
      method: "card",
      status: "paid",
      reference: settled.reference,
      paidAt: settled.paidAt.toISOString(),
    },
  };
}
