import type {
  AnalyticsDto,
  LotSnapshotDto,
  LotStatsDto,
  ParkingSessionDto,
  ParkingSpaceDto,
  PaymentDto,
  PricingRule,
  ReplayDto,
  RevenueDto,
  SessionHistoryItem,
  VehicleType,
} from "@shared/types";

const BASE = "/api";

class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let code = "request_failed";
    let message = `Request failed with status ${response.status}`;

    try {
      const body = (await response.json()) as { error?: string; message?: string };
      code = body.error ?? code;
      message = body.message ?? message;
    } catch {
      // Non-JSON error body (proxy timeout, gateway page) — keep the default.
    }

    throw new ApiRequestError(response.status, code, message);
  }

  return (await response.json()) as T;
}

export interface CheckInPayload {
  session: ParkingSessionDto;
  space: ParkingSpaceDto;
  stats: LotStatsDto;
}

export interface CheckOutPayload {
  session: NonNullable<ParkingSpaceDto["session"]>;
  space: ParkingSpaceDto;
  payment: PaymentDto;
  stats: LotStatsDto;
}

export const api = {
  health: () =>
    request<{ status: string; database: boolean; uptimeSeconds: number }>(
      "/health",
    ),

  lot: () => request<LotSnapshotDto>("/lot"),

  analytics: () => request<AnalyticsDto>("/analytics"),

  revenue: () => request<RevenueDto>("/revenue"),
  replay: () => request<ReplayDto>("/replay?stepMinutes=15"),

  pricingRules: () => request<{ pricingRules: PricingRule[] }>("/pricing"),

  sessions: (limit = 50) =>
    request<{ sessions: SessionHistoryItem[] }>(`/sessions?limit=${limit}`),

  checkIn: (spaceNumber: string, numberPlate: string, vehicleType: VehicleType) =>
    request<CheckInPayload>("/sessions", {
      method: "POST",
      body: JSON.stringify({ spaceNumber, numberPlate, vehicleType }),
    }),

  checkOut: (spaceNumber: string, method: "card" | "cash" = "card") =>
    request<CheckOutPayload>(`/sessions/${encodeURIComponent(spaceNumber)}?method=${method}`, {
      method: "DELETE",
    }),

  updatePricing: (
    id: number,
    patch: Partial<{
      hourlyRate: number;
      dailyMaximum: number;
      gracePeriodMinutes: number;
    }>,
  ) =>
    request<{ pricingRule: PricingRule }>(
      `/pricing/${id}`,
      { method: "PATCH", body: JSON.stringify(patch) },
    ),
};

export { ApiRequestError };