import type { RowDataPacket } from "mysql2";
import { BAYS } from "../../shared/lotLayout";
import { calculateParkingFee } from "../../shared/pricing";
import { paymentReference } from "../../shared/references";
import { DEFAULT_PRICING_RULES, resolveRateCard } from "../../shared/pricingRules";
import type { VehicleType } from "../../shared/types";
import { VEHICLE_TYPES } from "../../shared/types";
import { closePool, execute, query, withTransaction } from "../config/db";
import { isMainModule } from "../utils/isMain";

/* Deterministic PRNG so every seed run produces the same facility. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20260815);
const pick = <T>(items: readonly T[]): T => {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error("pick() called with an empty array");
  return item;
};

const intBetween = (min: number, max: number): number =>
  Math.floor(random() * (max - min + 1)) + min;

const PLATE_PREFIXES = ["CA", "CY", "CJ", "CL"] as const;
const FIRST_NAMES = [
  "Thandi", "Sipho", "Aisha", "Johan", "Lerato", "Pieter", "Naledi",
  "Ravi", "Zanele", "Willem", "Fatima", "Kagiso", "Elena", "Dinesh",
  "Michelle", "Tebogo", "Chantal", "Sibusiso",
] as const;
const LAST_NAMES = [
  "Mokoena", "Naidoo", "Botha", "Dlamini", "van Wyk", "Abubakar",
  "Molefe", "Pillay", "Ferreira", "Nkosi", "Jacobs", "Reddy",
  "Steenkamp", "Mahomed", "Kruger", "Sithole",
] as const;

const VEHICLE_POOL_SIZE = 44;
const HISTORY_DAYS = 14;
const TARGET_OCCUPANCY = 0.72;

interface SpaceRow extends RowDataPacket {
  id: number;
  space_number: string;
  type: VehicleType;
}

interface VehicleRow extends RowDataPacket {
  id: number;
  number_plate: string;
  type: VehicleType;
}

const pad = (value: number, size: number): string => String(value).padStart(size, "0");

function makePlate(index: number): string {
  const prefix = PLATE_PREFIXES[index % PLATE_PREFIXES.length] ?? "CA";
  return `${prefix} ${pad(intBetween(100, 999), 3)}-${pad(intBetween(100, 999), 3)}`;
}

const sqlDate = (date: Date): string => date.toISOString().slice(0, 19).replace("T", " ");

/** Bulk insert helper: one statement with N placeholder tuples. */
async function insertMany(
  table: string,
  columns: string[],
  rows: (string | number | null)[][],
  onDuplicate?: string,
): Promise<void> {
  if (rows.length === 0) return;

  const CHUNK = 500;
  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    const chunk = rows.slice(offset, offset + CHUNK);
    const tuples = chunk
      .map(() => `(${columns.map(() => "?").join(", ")})`)
      .join(", ");
    const params = chunk.flat();
    const suffix = onDuplicate ? ` ${onDuplicate}` : "";
    await execute(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples}${suffix}`,
      params,
    );
  }
}

async function seedFacility(): Promise<void> {
  await execute(
    `INSERT INTO facility (id, name, city, currency, timezone)
     VALUES (1, 'Apex Park', 'Cape Town', 'ZAR', 'Africa/Johannesburg')
     ON DUPLICATE KEY UPDATE name = VALUES(name), city = VALUES(city)`,
  );
}

async function seedPricingRules(): Promise<void> {
  await insertMany(
    "pricing_rules",
    [
      "vehicle_type",
      "label",
      "grace_period_minutes",
      "hourly_rate",
      "daily_maximum",
      "currency",
    ],
    DEFAULT_PRICING_RULES.map((rule) => [
      rule.vehicleType,
      rule.label,
      rule.gracePeriodMinutes,
      rule.hourlyRate,
      rule.dailyMaximum,
      rule.currency,
    ]),
    `ON DUPLICATE KEY UPDATE
       label = VALUES(label),
       grace_period_minutes = VALUES(grace_period_minutes),
       hourly_rate = VALUES(hourly_rate),
       daily_maximum = VALUES(daily_maximum),
       currency = VALUES(currency)`,
  );
}

async function seedSpaces(): Promise<SpaceRow[]> {
  await insertMany(
    "parking_spaces",
    ["space_number", "section", "ordinal", "type"],
    BAYS.map((bay) => [bay.spaceNumber, bay.section, bay.ordinal, bay.type]),
    // Deliberately never touches `status`: re-seeding must not reset the live
    // state of bays that currently have vehicles in them.
    `ON DUPLICATE KEY UPDATE
       section = VALUES(section),
       ordinal = VALUES(ordinal),
       type = VALUES(type)`,
  );

  // Retire bays that are no longer part of the layout, but only when no
  // session history references them.
  const current = BAYS.map((bay) => bay.spaceNumber);
  const placeholders = current.map(() => "?").join(", ");
  await execute(
    `DELETE FROM parking_spaces
      WHERE status = 'available'
        AND space_number NOT IN (${placeholders})`,
    current,
  );

  return query<SpaceRow>(
    "SELECT id, space_number, type FROM parking_spaces ORDER BY id",
  );
}

async function seedPeopleAndVehicles(): Promise<VehicleRow[]> {
  const existing = await query<VehicleRow>("SELECT id FROM vehicles LIMIT 1");
  if (existing.length > 0) {
    return query<VehicleRow>(
      "SELECT id, number_plate, type FROM vehicles ORDER BY id",
    );
  }

  const users: (string | number)[][] = [];
  const vehicles: (string | number)[][] = [];
  const seenPlates = new Set<string>();

  for (let i = 0; i < VEHICLE_POOL_SIZE; i += 1) {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    users.push([
      `${firstName} ${lastName}`,
      `+27${intBetween(60, 84)}${pad(intBetween(0, 99999999), 8)}`,
      `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s/g, "")}@example.co.za`,
    ]);

    let plate = makePlate(i);
    while (seenPlates.has(plate)) plate = makePlate(i + intBetween(1, 99));
    seenPlates.add(plate);

    vehicles.push([plate, pick(VEHICLE_TYPES), i + 1]);
  }

  await insertMany(
    "users",
    ["name", "phone_number", "email"],
    users,
  );
  await insertMany("vehicles", ["number_plate", "type", "user_id"], vehicles);

  return query<VehicleRow>(
    "SELECT id, number_plate, type FROM vehicles ORDER BY id",
  );
}

/** Fills the lot to the target occupancy with staggered arrival times. */
async function seedActiveSessions(
  spaces: SpaceRow[],
  vehicles: VehicleRow[],
  now: Date,
): Promise<number> {
  await execute("DELETE FROM parking_sessions WHERE status = 'active'");

  // Every bay is now genuinely empty, so clear stale `occupied` flags left
  // behind by previous seed runs before marking the new occupants.
  await execute(
    "UPDATE parking_spaces SET status = 'available' WHERE status <> 'reserved'",
  );

  const targetCount = Math.round(spaces.length * TARGET_OCCUPANCY);
  const shuffled = [...spaces].sort(() => random() - 0.5);
  const chosen = shuffled.slice(0, targetCount);
  const sessions: (string | number)[][] = [];
  const occupiedNumbers: string[] = [];

  const nowMs = now.getTime();

  chosen.forEach((space, index) => {
    // A vehicle can only occupy a bay it physically fits.
    const candidates = vehicles.filter((vehicle) => vehicle.type === space.type);
    const fallback = candidates.length > 0 ? candidates : vehicles;
    const vehicle = fallback[index % fallback.length];
    if (vehicle === undefined) return;

    // Most stays are a few hours; a few are overnight so the multi-day
    // pricing path and the overstay indicators have something to show.
    const hours =
      random() < 0.12 ? intBetween(20, 46) : intBetween(1, 7);
    const checkIn = new Date(nowMs - hours * 3_600_000);

    sessions.push([vehicle.id, space.id, sqlDate(checkIn)]);
    occupiedNumbers.push(space.space_number);
  });

  await insertMany(
    "parking_sessions",
    ["vehicle_id", "parking_space_id", "check_in_time"],
    sessions,
  );

  if (occupiedNumbers.length > 0) {
    const placeholders = occupiedNumbers.map(() => "?").join(", ");
    await execute(
      `UPDATE parking_spaces SET status = 'occupied'
        WHERE space_number IN (${placeholders})`,
      occupiedNumbers,
    );
  }

  return sessions.length;
}

/**
 * Two weeks of completed, paid sessions so revenue, peak-hour and duration
 * analytics have real data on first load instead of starting empty.
 */
async function seedHistory(
  spaces: SpaceRow[],
  vehicles: VehicleRow[],
  now: Date,
): Promise<{ sessions: number; revenue: number }> {
  await execute("DELETE FROM payments");
  await execute("DELETE FROM parking_sessions WHERE status = 'completed'");

  const rules = DEFAULT_PRICING_RULES;
  const sessions: (string | number | null)[][] = [];

  for (let dayOffset = HISTORY_DAYS; dayOffset >= 1; dayOffset -= 1) {
    const day = new Date(now.getTime() - dayOffset * 86_400_000);
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const sessionTarget = isWeekend ? intBetween(95, 140) : intBetween(120, 185);

    for (let i = 0; i < sessionTarget; i += 1) {
      const space = pick(spaces);
      const candidates = vehicles.filter((vehicle) => vehicle.type === space.type);
      const vehicle = candidates.length > 0 ? pick(candidates) : pick(vehicles);

      // Arrivals cluster around business hours, which is what makes the
      // peak-hour chart meaningful.
      const hour = intBetween(7, 19);
      const checkIn = new Date(day);
      checkIn.setHours(hour, intBetween(0, 59), 0, 0);

      const isLongStay = random() < 0.05;
      const durationMinutes = isLongStay
        ? intBetween(1440, 4320)
        : Math.round(20 + random() ** 2 * 340);

      const checkOut = new Date(checkIn.getTime() + durationMinutes * 60_000);
      const rateCard = resolveRateCard(vehicle.type, rules);
      const breakdown = calculateParkingFee({
        checkInTime: checkIn,
        checkOutTime: checkOut,
        rule: rateCard,
      });

      if (checkOut > now) continue;

      sessions.push([
        vehicle.id,
        space.id,
        sqlDate(checkIn),
        sqlDate(checkOut),
        "completed",
        breakdown.totalFee,
      ]);
    }
  }

  await insertMany(
    "parking_sessions",
    [
      "vehicle_id",
      "parking_space_id",
      "check_in_time",
      "check_out_time",
      "status",
      "fee",
    ],
    sessions,
  );

  const completed = await query<RowDataPacket & { id: number; fee: number; check_out_time: Date }>(
    `SELECT id, fee, check_out_time
       FROM parking_sessions
      WHERE status = 'completed'
      ORDER BY check_out_time DESC`,
  );

  const payments: (string | number | null)[][] = [];
  let revenue = 0;

  completed.forEach((session) => {
    const fee = Number(session.fee ?? 0);
    const paidAt = new Date(session.check_out_time);
    payments.push([
      session.id,
      fee,
      random() < 0.82 ? "card" : "cash",
      "paid",
      // Must match the runtime scheme in checkOut: the reference is derived
      // from the session id, which is what keeps it unique against the
      // `uq_payments_reference` index.
      paymentReference(session.id, paidAt),
      sqlDate(paidAt),
    ]);
    revenue += fee;
  });

  await insertMany(
    "payments",
    ["session_id", "amount", "method", "status", "reference", "paid_at"],
    payments,
  );

  return { sessions: sessions.length, revenue: Math.round(revenue * 100) / 100 };
}

/** 24 hours of occupancy samples at 30-minute resolution for the trend chart. */
async function seedSnapshots(spaces: SpaceRow[], now: Date): Promise<number> {
  await execute("DELETE FROM occupancy_snapshots");

  const total = spaces.length;
  const rows: (string | number)[][] = [];

  for (let step = 48; step >= 0; step -= 1) {
    const at = new Date(now.getTime() - step * 30 * 60_000);
    const hour = at.getHours();

    // Retail profile: quiet overnight, building to a lunchtime peak.
    const shape =
      hour <= 5
        ? 0.06
        : hour <= 9
          ? 0.42
          : hour <= 13
            ? 0.82
            : hour <= 17
              ? 0.7
              : hour <= 20
                ? 0.48
                : 0.22;

    const jitter = (random() - 0.5) * 0.06;
    const rate = Math.min(0.95, Math.max(0.02, shape + jitter));
    rows.push([sqlDate(at), Math.round(total * rate), total, 0]);
  }

  await insertMany(
    "occupancy_snapshots",
    ["recorded_at", "occupied", "total", "revenue_today"],
    rows,
  );

  return rows.length;
}

async function seed(): Promise<void> {
  const now = new Date();
  console.log(`Seeding facility (reference time ${now.toISOString()})`);

  await withTransaction(async () => {
    await seedFacility();
    await seedPricingRules();
  });
  console.log(`  facility + ${DEFAULT_PRICING_RULES.length} pricing rules`);

  const spaces = await seedSpaces();
  console.log(`  ${spaces.length} parking bays`);

  const vehicles = await seedPeopleAndVehicles();
  console.log(`  ${vehicles.length} registered vehicles`);

  const active = await seedActiveSessions(spaces, vehicles, now);
  console.log(`  ${active} active sessions (${Math.round((active / spaces.length) * 100)}% full)`);

  const history = await seedHistory(spaces, vehicles, now);
  console.log(`  ${history.sessions} completed sessions, R${history.revenue.toFixed(2)} collected`);

  const snapshots = await seedSnapshots(spaces, now);
  console.log(`  ${snapshots} occupancy snapshots`);

  console.log("Seed complete.");
}

if (isMainModule(import.meta.url)) {
  seed()
    .then(() => closePool())
    .catch(async (error: unknown) => {
      console.error("Seed failed:", error);
      await closePool().catch(() => undefined);
      process.exit(1);
    });
}

export { seed };