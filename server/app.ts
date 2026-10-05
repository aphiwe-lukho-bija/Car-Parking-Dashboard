import cors from "cors";
import express from "express";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { env } from "./config/env";
import { AppError } from "./errors";
import { createApiRouter } from "./routes/api";

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");

  app.use(
    cors({
      origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(","),
      credentials: true,
    }),
  );

  // Bodies are small by design — no file uploads in this service.
  app.use(express.json({ limit: "64kb" }));

  const noStore: RequestHandler = (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  };
  app.use("/api", noStore);

  app.use("/api", createApiRouter());

  app.use((_req, res) => {
    res.status(404).json({
      error: "not_found",
      message: "No such endpoint",
    });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: "invalid_request",
        message: "Request body failed validation",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    if (error instanceof AppError) {
      res.status(error.status).json({
        error: error.code,
        message: error.message,
        details: error.details,
      });
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("[api] unhandled error:", error);

    res.status(500).json({
      error: "internal_error",
      message:
        env.nodeEnv === "production" ? "Unexpected server error" : message,
    });
  };

  app.use(errorHandler);

  return app;
}