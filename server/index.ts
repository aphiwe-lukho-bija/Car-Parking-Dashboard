import { createServer } from "node:http";
import { createApp } from "./app";
import { closePool, pingDatabase } from "./config/db";
import { env } from "./config/env";
import { createRealtime } from "./realtime";
import { startSimulation } from "./services/simulationService";
import {
  publishSessionClosed,
  publishSessionOpened,
} from "./services/sessionEvents";

async function main(): Promise<void> {
  const app = createApp();
  const server = createServer(app);

  const realtime = createRealtime(server);

  const stopSimulation = startSimulation({
    sessionOpened: (payload) => publishSessionOpened(payload),
    sessionClosed: (payload) => publishSessionClosed(payload),
    tick: () => realtime.publishTick(),
  });

  const databaseReady = await pingDatabase();
  if (!databaseReady) {
    console.warn(
      `[server] cannot reach MySQL at ${env.db.host}:${env.db.port}/${env.db.database}. ` +
        "Run `npm run db:reset` before expecting data.",
    );
  }

  server.listen(env.port, () => {
    console.log("");
    console.log("  Apex Park API");
    console.log(`  REST        http://localhost:${env.port}/api/lot`);
    console.log(`  WebSocket   ws://localhost:${env.port}/ws`);
    console.log(`  Health      http://localhost:${env.port}/api/health`);
    console.log(`  Database    ${env.db.host}:${env.db.port}/${env.db.database}`);
    console.log("");
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[server] ${signal} received, shutting down`);
    stopSimulation();
    await realtime.hub.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closePool();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error("[server] failed to start:", error);
  process.exit(1);
});