import type { LotSnapshotDto } from "../../shared/types";
import { getAnalytics } from "./analyticsService";
import {
  getFacility,
  getLotStats,
  getPricingRuleList,
  getSpaces,
} from "./parkingService";

/**
 * Builds the full facility picture. Shared by `GET /api/lot` and by the
 * WebSocket handshake so a newly connected client is in exactly the same state
 * as one that has been streaming updates for an hour.
 */
export async function loadSnapshot(now = new Date()): Promise<LotSnapshotDto> {
  const spaces = await getSpaces(now);
  const stats = await getLotStats(spaces);

  const [facility, pricingRules, analytics] = await Promise.all([
    getFacility(),
    getPricingRuleList(),
    getAnalytics(now, stats.total),
  ]);

  return {
    facility,
    spaces,
    stats,
    pricingRules,
    analytics,
    serverTime: now.toISOString(),
  };
}