import type { Server } from "node:http";
import type { RawData, WebSocket } from "ws";
import { WebSocketServer } from "ws";

const HEARTBEAT_MS = 30_000;

export interface HubHandlers {
  /** Called once per client, before any messages are handled. */
  onConnect(socket: WebSocket): void | Promise<void>;
  onMessage(socket: WebSocket, raw: RawData): void | Promise<void>;
  onClose(socket: WebSocket): void | Promise<void>;
}

/**
 * WebSocket fan-out.
 *
 * Deliberately knows nothing about parking: it only tracks sockets and
 * serialises typed events. Domain wiring lives in `./index.ts`, which keeps
 * this transport reusable and trivially testable.
 */
export class RealtimeHub {
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<WebSocket>();
  private readonly alive = new WeakMap<WebSocket, boolean>();
  private readonly heartbeat: NodeJS.Timeout;

  constructor(server: Server, private readonly handlers: HubHandlers) {
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on("connection", (socket) => {
      this.clients.add(socket);
      this.alive.set(socket, true);

      socket.on("pong", () => {
        this.alive.set(socket, true);
      });

      socket.on("message", (raw) => {
        void this.handlers.onMessage(socket, raw);
      });

      socket.on("close", () => {
        this.clients.delete(socket);
        void this.handlers.onClose(socket);
      });

      socket.on("error", () => {
        this.clients.delete(socket);
      });

      void this.handlers.onConnect(socket);
    });

    // Drop sockets that stopped answering so the client count stays honest.
    this.heartbeat = setInterval(() => {
      for (const socket of this.clients) {
        if (this.alive.get(socket) === false) {
          socket.terminate();
          this.clients.delete(socket);
          continue;
        }
        this.alive.set(socket, false);
        socket.ping();
      }
    }, HEARTBEAT_MS);

    this.heartbeat.unref();
  }

  get clientCount(): number {
    return this.clients.size;
  }

  send(socket: WebSocket, payload: unknown): void {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify(payload));
  }

  broadcast(payload: unknown): void {
    if (this.clients.size === 0) return;

    const encoded = JSON.stringify(payload);
    for (const socket of this.clients) {
      if (socket.readyState === socket.OPEN) socket.send(encoded);
    }
  }

  async close(): Promise<void> {
    clearInterval(this.heartbeat);
    for (const socket of this.clients) socket.terminate();
    this.clients.clear();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }
}