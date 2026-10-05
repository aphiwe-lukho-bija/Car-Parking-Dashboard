/**
 * Wire contract shared by the Express API, the WebSocket hub and the React
 * client. Everything crossing the network boundary lives here so the two sides
 * can never drift apart.
 *
 * Dates are ISO-8601 strings, never `Date` objects — JSON has no date type and
 * silently losing timezone information is how billing bugs start.
 */

export const VEHICLE_TYPES = ["car", "suv", "truck", "motorbike"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  car: "Car",
  suv: "SUV",
  truck: "Truck",
  motorbike: "Motorbike",
};

export const SPACE_STATUSES = ["available", "occupied", "reserved"] as const;
export type SpaceStatus = (typeof SPACE_STATUSES)[number];

export const SESSION_STATUSES = ["active", "completed"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const PAYMENT_METHODS = ["card", "cash"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface RateCard {
  gracePeriodMinutes: number;
  hourlyRate: number;
  dailyMaximum: number;
  currency: string;
}

export interface PricingRule extends RateCard {
  id: number;
  vehicleType: VehicleType;
  label: string;
}

export interface VehicleDto {
  id: number;
  numberPlate: string;
  type: VehicleType;
}

export interface ParkingSessionDto {
  id: number;
  spaceNumber: string;
  vehicle: VehicleDto;
  checkInTime: string;
  checkOutTime: string | null;
  /** Recomputed on every tick while the session is open. */
  runningFee: number;
  finalFee: number | null;
  status: SessionStatus;
  /** Open past its grace period. */
  overGrace: boolean;
  /** Open past the point where the day's cap will be reached. */
  nearCap: boolean;
  /** Minutes until the daily cap is hit, or null if not tracking a cap. */
  minutesToCap: number | null;
  /** Formally flagged for overstay enforcement, i.e. a towing candidate. */
  isOverstay: boolean;
}

export interface ParkingSpaceDto {
  id: number;
  spaceNumber: string;
  section: string;
  type: VehicleType;
  status: SpaceStatus;
  vehicle: VehicleDto | null;
  session: ParkingSessionDto | null;
}

export interface PaymentDto {
  id: number;
  sessionId: number;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string;
  paidAt: string | null;
}

export interface LotStatsDto {
  total: number;
  occupied: number;
  available: number;
  reserved: number;
  occupancyRate: number;
  activeSessions: number;
  revenueToday: number;
  averageStayMinutes: number;
  overstayCount: number;
  /** Revenue collected per occupied bay today, a real efficiency metric. */
  revenuePerSpace: number;
}

export interface FacilityDto {
  name: string;
  city: string;
  currency: string;
  timezone: string;
}

export interface OccupancyPoint {
  at: string;
  occupancyRate: number;
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  sessions: number;
}

export interface PeakHourPoint {
  hour: number;
  occupancyRate: number;
}

export interface DurationBucket {
  label: string;
  count: number;
}

export interface VehicleMixPoint {
  type: VehicleType;
  count: number;
}

/**
 * A vehicle currently occupying a bay, with the fee accrued so far.
 *
 * This is unbilled money: it is what the facility is owed right now for cars
 * already on site, which is why it is surfaced separately from revenue
 * collected. Cars whose accrued fee has reached the daily cap are the ones
 * worth towing, because they have stopped costing the operator anything.
 */
export interface AtRiskVehicle {
  sessionId: number;
  spaceNumber: string;
  numberPlate: string;
  vehicleType: VehicleType;
  checkInTime: string;
  accruedFee: number;
  /** True once the accrued fee for today has reached the daily maximum. */
  cappedToday: boolean;
  /** True when this stay has been formally flagged for overstay enforcement. */
  overstay: boolean;
  /** Minutes past the point the day's cap was reached, or null if not capped. */
  minutesOverCap: number | null;
}

/** Where the money came from. Enforcement streams are zero until those
 *  features are switched on, but the shape is fixed so the UI can show them. */
/** A vehicle the operator can act on: parked well past its permitted stay. */
export interface OverstayTarget {
  sessionId: number;
  spaceNumber: string;
  numberPlate: string;
  vehicleType: VehicleType;
  checkInTime: string;
  hoursOverstayed: number;
}

export type RevenueStreamKey = "parking" | "overstay" | "towing" | "other";

export interface RevenueStream {
  key: RevenueStreamKey;
  label: string;
  amount: number;
  sessions: number;
}

export interface RevenueDto {
  currency: string;
  /** Cash actually taken today. */
  collectedToday: number;
  /** Sessions settled today. */
  sessionsToday: number;
  averageTicket: number;
  /** Collected today divided by the number of bays. */
  yieldPerSpace: number;
  /** Value accrued by cars on site that has not been billed yet. */
  atRisk: number;
  atRiskVehicles: number;
  /** Subset of `atRisk` owed by cars that have hit their daily cap. */
  cappedExposure: number;
  /** Vehicles formally flagged as overstaying, i.e. towing candidates. */
  overstayTargets: OverstayTarget[];
  streams: RevenueStream[];
  hourlyToday: { hour: number; revenue: number; sessions: number }[];
  atRiskDetail: AtRiskVehicle[];
}

export interface AnalyticsDto {
  occupancyHistory: OccupancyPoint[];
  revenueByDay: RevenuePoint[];
  peakHours: PeakHourPoint[];
  durationBuckets: DurationBucket[];
  vehicleMix: VehicleMixPoint[];
  totalRevenue: number;
  totalSessions: number;
}

export interface LotSnapshotDto {
  facility: FacilityDto;
  spaces: ParkingSpaceDto[];
  stats: LotStatsDto;
  pricingRules: PricingRule[];
  analytics: AnalyticsDto;
  serverTime: string;
}

/* ------------------------------------------------------------------ */
/* WebSocket protocol                                                   */
/* ------------------------------------------------------------------ */

export interface SpaceChangedPayload {
  space: ParkingSpaceDto;
  stats: LotStatsDto;
}

export interface SessionOpenedPayload {
  session: ParkingSessionDto;
  space: ParkingSpaceDto;
  stats: LotStatsDto;
}

export interface SessionClosedPayload {
  session: ParkingSessionDto;
  payment: PaymentDto;
  space: ParkingSpaceDto;
  stats: LotStatsDto;
}

export interface TickPayload {
  stats: LotStatsDto;
  spaces: ParkingSpaceDto[];
  analytics: AnalyticsDto;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

/** Server -> client. */
export type ServerEvent =
  | { type: "snapshot"; payload: LotSnapshotDto }
  | { type: "space.changed"; payload: SpaceChangedPayload }
  | { type: "session.opened"; payload: SessionOpenedPayload }
  | { type: "session.closed"; payload: SessionClosedPayload }
  | { type: "tick"; payload: TickPayload }
  | { type: "error"; payload: ErrorPayload };

/** Client -> server. */
export type ClientEvent =
  | { type: "checkin"; payload: CheckInRequest }
  | { type: "checkout"; payload: CheckoutRequest };

export interface CheckInRequest {
  spaceNumber: string;
  numberPlate: string;
  vehicleType: VehicleType;
}

export interface CheckoutRequest {
  spaceNumber: string;
}

export const CONNECTION_STATES = ["connecting", "live", "reconnecting", "offline"] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: unknown;
}

export interface SessionHistoryItem {
  id: number;
  spaceNumber: string;
  numberPlate: string;
  vehicleType: VehicleType;
  checkInTime: string;
  checkOutTime: string | null;
  fee: number | null;
  status: SessionStatus;
}

export const isServerEvent = (value: unknown): value is ServerEvent => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { type?: unknown; payload?: unknown };
  return typeof candidate.type === "string" && "payload" in candidate;
};
/* ------------------------------------------------------------------ */
/* Day replay                                                          */
/* ------------------------------------------------------------------ */

/**
 * One sampled instant of the operating day.
 *
 * `bays` carries the specific occupied spaces rather than just a headcount,
 * which is what lets the replay animate the real layout instead of a bar chart.
 */
export interface ReplayFrame {
  at: string;
  occupied: number;
  capacity: number;
  /** Cash collected up to and including this instant, in currency minor units. */
  revenue: number;
  bays: string[];
  arrivals: number;
  departures: number;
}

export interface ReplayBusiestBay {
  spaceNumber: string;
  sessions: number;
  hours: number;
}

export interface ReplayDto {
  date: string;
  stepMinutes: number;
  currency: string;
  frames: ReplayFrame[];
  totalRevenue: number;
  totalSessions: number;
  peakOccupancy: number;
  peakAt: string | null;
  /** True while the replay is showing live data rather than a past day. */
  live: boolean;
  busiestBay: ReplayBusiestBay | null;
}
