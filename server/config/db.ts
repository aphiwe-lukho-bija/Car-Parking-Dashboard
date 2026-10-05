import mysql from "mysql2/promise";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { env } from "./env";

/** Values mysql2 accepts as bound parameters. */
export type SqlValue = string | number | boolean | null | Date | Buffer;

/**
 * Shared connection pool. `decimalNumbers` is on so DECIMAL money columns
 * arrive as JS numbers instead of strings, and the timezone is pinned so a
 * server in a different region cannot silently shift every timestamp.
 */
export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: env.db.connectionLimit,
  queueLimit: 0,
  timezone: "Z",
  decimalNumbers: true,
  multipleStatements: false,
  charset: "utf8mb4_unicode_ci",
});

/** Runs a SELECT and returns typed rows. */
export async function query<T extends RowDataPacket>(
  sql: string,
  params: SqlValue[] = [],
): Promise<T[]> {
  const [rows] = await pool.query<T[]>(sql, params);
  return rows;
}

export async function queryOne<T extends RowDataPacket>(
  sql: string,
  params: SqlValue[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Runs an INSERT/UPDATE/DELETE and returns the result header. */
export async function execute(
  sql: string,
  params: SqlValue[] = [],
): Promise<ResultSetHeader> {
  const [result] = await pool.execute<ResultSetHeader>(sql, params);
  return result;
}

/**
 * Runs `fn` inside a transaction, committing on success and rolling back on any
 * throw. Used wherever a check-in must move the bay and open the session
 * atomically, otherwise a crash would leave bays permanently stuck as occupied.
 */
export async function withTransaction<T>(
  fn: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}