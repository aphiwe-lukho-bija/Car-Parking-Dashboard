import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import { closePool, pool } from "../config/db";
import { env } from "../config/env";
import { isMainModule } from "../utils/isMain";

const schemaPath = fileURLToPath(new URL("./schema.sql", import.meta.url));

/**
 * Splits a .sql file into individual statements.
 *
 * `multipleStatements` stays disabled on the pool for defence in depth, so the
 * schema is applied one statement at a time here instead. Full-line `--`
 * comments are stripped first so a semicolon inside a comment cannot split a
 * statement in half.
 */
export function splitStatements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function ensureDatabase(fresh: boolean): Promise<void> {
  const admin = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
  });

  try {
    if (fresh) {
      console.log(`Dropping database ${env.db.database}`);
      await admin.query(`DROP DATABASE IF EXISTS \`${env.db.database}\``);
    }

    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` ` +
        "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
    );
    console.log(`Database ${env.db.database} ready`);
  } finally {
    await admin.end();
  }
}

export async function migrate(fresh = false): Promise<void> {
  await ensureDatabase(fresh);

  const sql = await readFile(schemaPath, "utf8");
  const statements = splitStatements(sql);

  for (const statement of statements) {
    await pool.query(statement);
  }

  await ensureColumns();

  const tableName = /CREATE TABLE IF NOT EXISTS\s+(\w+)/i.exec(statements[0] ?? "");
  console.log(`Applied ${statements.length} schema statements`);
  console.log(`  first table: ${tableName?.[1] ?? "unknown"}`);
}

/**
 * Columns added to a table that already existed.
 *
 * `CREATE TABLE IF NOT EXISTS` cannot extend a table created by an earlier
 * version of the schema, so a database that predates a column is repaired here
 * instead. Every check is idempotent, which is what lets `db:migrate` be run
 * on both a fresh and an ageing install.
 */
async function ensureColumns(): Promise<void> {
  const additions: { table: string; column: string; ddl: string }[] = [
    {
      table: "payments",
      column: "kind",
      ddl:
        "ADD COLUMN kind ENUM('parking','overstay','towing','other') " +
        "NOT NULL DEFAULT 'parking' AFTER status",
    },
  ];

  for (const addition of additions) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS present
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?`,
      [env.db.database, addition.table, addition.column],
    );

    if (Number(rows[0]?.present ?? 0) > 0) continue;

    await pool.query(
      `ALTER TABLE \`${addition.table}\` ${addition.ddl}`,
    );
    console.log(`  added ${addition.table}.${addition.column}`);
  }
}

if (isMainModule(import.meta.url)) {
  const fresh = process.argv.includes("--fresh");

  migrate(fresh)
    .then(async () => {
      console.log("Migration complete. Next: npm run db:seed");
      await closePool();
    })
    .catch(async (error: unknown) => {
      console.error("Migration failed:", error);
      await closePool().catch(() => undefined);
      process.exit(1);
    });
}