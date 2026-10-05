import "dotenv/config";

// Pin the process timezone to the facility's location. Billing splits stays on
// local midnight, so this has to be set before any Date is constructed.
process.env.TZ = process.env.FACILITY_TZ ?? "Africa/Johannesburg";

function str(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function num(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value === "true" || value === "1";
}

export const env = {
  port: num("PORT", 4000),
  nodeEnv: str("NODE_ENV", "development"),
  corsOrigin: str("CORS_ORIGIN", "http://localhost:3000"),
  db: {
    host: str("DB_HOST", "127.0.0.1"),
    port: num("DB_PORT", 3306),
    user: str("DB_USER", "root"),
    password: str("DB_PASSWORD", ""),
    database: str("DB_NAME", "apex_parking"),
    connectionLimit: num("DB_POOL_SIZE", 10),
  },
  simulation: {
    enabled: bool("SIMULATION_ENABLED", true),
    /**
     * How often the simulator considers moving a vehicle.
     *
     * Defaulted to a calm 20s rather than anything faster so a presenter can
     * register a car by hand and narrate it without the lot churning around the
     * story. Drop to ~2500-4000 for a rush-hour feel in screenshots.
     */
    tickMs: num("SIMULATION_TICK_MS", 20_000),
    /** Chance a tick produces an arrival rather than a departure. */
    arrivalBias: num("SIMULATION_ARRIVAL_BIAS", 0.62),
    /** Occupancy the simulator steers towards, 0..1. */
    targetOccupancy: num("SIMULATION_TARGET_OCCUPANCY", 0.72),
    /** Live fee/rate refresh cadence pushed to clients. */
    pushMs: num("SIMULATION_PUSH_MS", 2000),
  },
} as const;

export type Env = typeof env;