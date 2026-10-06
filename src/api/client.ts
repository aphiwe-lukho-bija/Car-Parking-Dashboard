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

/** The signed token for the current operator, or null when signed out. */
let authToken: string | null = null;
/** Invoked when the API rejects a request as unauthenticated. */
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

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
      ...(authToken !== null ? { Authorization: `Bearer ${authToken}` } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 401) {
    onUnauthorized?.();
  }

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

export interface AuthUserDto {
  username: string;
  role: "admin";
}

export interface AuthSessionDto {
  token: string;
  user: AuthUserDto;
  expiresAt: string;
}

export const api = {
  login: (username: string, password: string) =>
    request<AuthSessionDto>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  me: () => request<{ user: AuthUserDto }>("/auth/me"),

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

  /** Enforcement: removes a flagged overstayer and settles its balance. */
  tow: (spaceNumber: string) =>
    request<CheckOutPayload>(`/sessions/${encodeURIComponent(spaceNumber)}/tow`, {
      method: "POST",
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