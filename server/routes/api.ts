import { Router } from "express";
import type { Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { VEHICLE_TYPES } from "../../shared/types";
import { pingDatabase } from "../config/db";
import { AppError } from "../errors";
import { getAnalytics } from "../services/analyticsService";
import {
  checkIn,
  checkOut,
  getLotStats,
  getPricingRuleList,
  getSessionHistory,
  getSpaces,
} from "../services/parkingService";
import { updatePricingRule } from "../services/pricingService";
import { getRevenue } from "../services/revenueService";
import { getDayReplay } from "../services/replayService";
import {
  publishSessionClosed,
  publishSessionOpened,
} from "../services/sessionEvents";
import { loadSnapshot } from "../services/snapshotService";

const checkInBody = z.object({
  spaceNumber: z.string().trim().min(1).max(8),
  numberPlate: z.string().trim().min(5).max(10),
  vehicleType: z.enum(VEHICLE_TYPES),
});

const checkOutBody = z.object({
  spaceNumber: z.string().trim().min(1).max(8),
  method: z.enum(["card", "cash"]),
});

const pricingPatch = z
  .object({
    hourlyRate: z.number().positive().max(10_000).optional(),
    dailyMaximum: z.number().positive().max(1_000_000).optional(),
    gracePeriodMinutes: z.number().int().min(0).max(240).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

/** Wraps an async handler so a rejected promise reaches the error middleware. */
function asyncRoute(
  handler: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

/** Express types query values as string | string[] | ParsedQs. */
function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

export function createApiRouter(): Router {
  const router = Router();

  router.get(
    "/health",
    asyncRoute(async (_req, res) => {
      const database = await pingDatabase();
      res.status(database ? 200 : 503).json({
        status: database ? "ok" : "degraded",
        database,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    }),
  );

  router.get(
    "/lot",
    asyncRoute(async (_req, res) => {
      res.json(await loadSnapshot());
    }),
  );

  router.get(
    "/spaces",
    asyncRoute(async (_req, res) => {
      res.json({ spaces: await getSpaces(), serverTime: new Date().toISOString() });
    }),
  );

  router.get(
    "/revenue",
    asyncRoute(async (_req, res) => {
      const spaces = await getSpaces();
      res.json(await getRevenue(new Date(), spaces.length));
    }),
  );

  router.get(
    "/replay",
    asyncRoute(async (req, res) => {
      const date = typeof req.query.date === "string" ? req.query.date : undefined;
      const stepRaw = Number(req.query.stepMinutes);
      const stepMinutes = Number.isFinite(stepRaw) ? stepRaw : 15;
      res.json(await getDayReplay(date, new Date(), stepMinutes));
    }),
  );

  router.get(
    "/stats",
    asyncRoute(async (_req, res) => {
      const spaces = await getSpaces();
      res.json(await getLotStats(spaces));
    }),
  );

  router.get(
    "/analytics",
    asyncRoute(async (_req, res) => {
      const spaces = await getSpaces();
      const stats = await getLotStats(spaces);
      res.json(await getAnalytics(new Date(), stats.total));
    }),
  );

  router.get(
    "/pricing",
    asyncRoute(async (_req, res) => {
      res.json({ pricingRules: await getPricingRuleList() });
    }),
  );

  router.patch(
    "/pricing/:id",
    asyncRoute(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        throw AppError.badRequest("invalid_id", "Pricing rule id must be an integer");
      }

      const patch = pricingPatch.parse(req.body);
      const pricingRule = await updatePricingRule(id, patch);

      if (pricingRule === null) {
        throw AppError.notFound(`Pricing rule ${id} does not exist`);
      }

      res.json({ pricingRule });
    }),
  );

  router.get(
    "/sessions",
    asyncRoute(async (req, res) => {
      const requested = Number(firstQueryValue(req.query.limit) ?? 50);
      const limit = Number.isFinite(requested)
        ? Math.min(Math.max(1, Math.trunc(requested)), 200)
        : 50;

      const rows = await getSessionHistory(limit);
      res.json({
        sessions: rows.map((row) => ({
          id: row.id,
          spaceNumber: row.space_number,
          numberPlate: row.number_plate,
          vehicleType: row.vehicle_type,
          checkInTime: row.check_in_time.toISOString(),
          checkOutTime: row.check_out_time?.toISOString() ?? null,
          fee: row.fee === null ? null : Number(row.fee),
          status: row.status,
        })),
      });
    }),
  );

  router.post(
    "/sessions",
    asyncRoute(async (req, res) => {
      const body = checkInBody.parse(req.body);

      const result = await checkIn(
        body.spaceNumber.toUpperCase(),
        body.numberPlate.toUpperCase(),
        body.vehicleType,
      );
      const stats = await getLotStats(await getSpaces());

      // Broadcast before responding, so a hand-registered car animates into the
      // lot on every screen at the same moment it succeeds here.
      publishSessionOpened({ ...result, stats });

      res.status(201).json({ ...result, stats });
    }),
  );

  router.delete(
    "/sessions/:spaceNumber",
    asyncRoute(async (req, res) => {
      const { spaceNumber, method } = checkOutBody.parse({
        spaceNumber: req.params.spaceNumber,
        method: firstQueryValue(req.query.method) ?? "card",
      });

      const result = await checkOut(spaceNumber.toUpperCase(), method);
      const stats = await getLotStats(await getSpaces());

      publishSessionClosed({ ...result, stats });

      res.json({ ...result, stats });
    }),
  );

  return router;
}