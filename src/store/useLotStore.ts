import { create } from "zustand";
import type { VisualQuality } from "../three/CinematicPost";
import type {
  AnalyticsDto,
  ConnectionState,
  FacilityDto,
  LotStatsDto,
  ParkingSessionDto,
  ParkingSpaceDto,
  PaymentDto,
  PricingRule,
  RevenueDto,
  VehicleType,
} from "@shared/types";
import { api, setAuthToken, setUnauthorizedHandler } from "../api/client";
import type { CheckOutPayload } from "../api/client";

export interface ActivityItem {
  id: string;
  kind: "arrival" | "departure" | "tow";
  spaceNumber: string;
  numberPlate: string;
  vehicleType: VehicleType;
  at: number;
  amount: number | null;
  reference?: string;
}

export interface ReceiptItem extends ActivityItem {
  kind: "departure";
  amount: number;
  reference: string;
  lines: { date: string; hours: number; amount: number; capped: boolean }[];
}

/**
 * A vehicle is being towed off site right now.
 *
 * Set the instant the enforcement broadcast lands, cleared when the 3D layer
 * has finished staging the removal. The scene reads it to decide between
 * driving a car out under its own power and hauling it away behind a truck.
 */
export interface TowEvent {
  sessionId: number;
  spaceNumber: string;
  numberPlate: string;
  vehicleType: VehicleType;
  at: number;
}

/** A signed-in operator, persisted so a page refresh keeps them signed in. */
export type CameraMode = "free" | "cinematic";

export interface AuthSession {
  token: string;
  username: string;
  /** ISO timestamp; a session read past this point is silently discarded. */
  expiresAt: string;
}

const AUTH_STORAGE_KEY = "apex.console.session";

function readStoredAuth(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw === null) return null;

    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (
      typeof parsed.token !== "string" ||
      typeof parsed.username !== "string" ||
      typeof parsed.expiresAt !== "string" ||
      Date.parse(parsed.expiresAt) <= Date.now()
    ) {
      return null;
    }

    return { token: parsed.token, username: parsed.username, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function persistAuth(session: AuthSession | null): void {
  if (typeof window === "undefined") return;
  try {
    if (session === null) window.localStorage.removeItem(AUTH_STORAGE_KEY);
    else window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). Sign-in still
    // works for the session; it just will not survive a reload.
  }
}

const initialAuth = readStoredAuth();
setAuthToken(initialAuth?.token ?? null);

interface LotState {
  facility: FacilityDto | null;
  spaces: ParkingSpaceDto[];
  stats: LotStatsDto | null;
  analytics: AnalyticsDto | null;
  revenue: RevenueDto | null;
  pricingRules: PricingRule[];
  connection: ConnectionState;

  /**
   * How the 3D camera behaves. "free" hands the orbit rig entirely to the
   * operator (rotate, tilt, pan, zoom, no idle drift); "cinematic" restores the
   * scripted altitude climb and idle drift, and lets tows borrow the camera.
   */
  cameraMode: CameraMode;
  /** Bumped to ask the rig to snap the orbit back to its starting view. */
  cameraResetToken: number;

  activity: ActivityItem[];
  receipts: ReceiptItem[];
  selectedBay: string | null;
  pendingBays: string[];
  visualQuality: VisualQuality;
  /**
   * Set of bay numbers the replay is currently showing, or null when live.
   * The 3D layer and the bay grid both read this so the whole dashboard is
   * rewound together rather than only the chart.
   */
  replayBays: Set<string> | null;
  /** Active tow, while the scene is still staging it. */
  towEvent: TowEvent | null;
  /**
   * Held while a scripted camera move owns the view. The orbit rig watches it
   * and stands down, so the cinematic and the operator never fight over the
   * same camera. Kept in state rather than the frame-level bus because it
   * flips twice per tow, not sixty times a second.
   */
  cameraLocked: boolean;

  /** True while the customer-facing payment kiosk is on screen. */
  paymentKioskOpen: boolean;

  /** The signed-in operator, or null while the login screen is showing. */
  auth: AuthSession | null;
  authenticating: boolean;
  authError: string | null;

  hydrate: () => Promise<void>;
  applySnapshot: (spaces: ParkingSpaceDto[], stats: LotStatsDto) => void;
  setConnection: (state: ConnectionState) => void;
  setAnalytics: (analytics: AnalyticsDto) => void;
  setRevenue: (revenue: RevenueDto) => void;
  selectBay: (spaceNumber: string | null) => void;
  setVisualQuality: (quality: VisualQuality) => void;
  setLiveBays: (bays: Set<string> | null) => void;
  checkIn: (spaceNumber: string, plate: string, type: VehicleType) => Promise<void>;
  checkOut: (spaceNumber: string, method?: "card" | "cash") => Promise<CheckOutPayload>;
tow: (spaceNumber: string) => Promise<void>;
  beginTow: (event: TowEvent) => void;
  clearTow: () => void;
  setCameraLocked: (locked: boolean) => void;
  setCameraMode: (mode: CameraMode) => void;
  resetCamera: () => void;
  openPaymentKiosk: () => void;
  closePaymentKiosk: () => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

let activityId = 0;
const nextId = () => `act-${(activityId += 1)}`;

let towWatchdog: ReturnType<typeof setTimeout> | null = null;

/** Forces a stalled tow to settle so the bay is never hidden for good. */
function scheduleTowWatchdog(): void {
  if (towWatchdog !== null) clearTimeout(towWatchdog);
  towWatchdog = setTimeout(() => {
    towWatchdog = null;
    if (useLotStore.getState().towEvent !== null) useLotStore.getState().clearTow();
  }, 90_000);
}

/**
 * Reads the starting render budget from the URL.
 *
 * Worth having beyond automation: the effects stack is the one part of the
 * dashboard that depends on the machine it is presented from, and a link like
 * `?quality=lite` lets an operator force the cheap path before the demo rather
 * than hunting for a toggle under pressure. Anything unrecognised falls back to
 * the full pipeline.
 */
function initialVisualQuality(): VisualQuality {
  if (typeof window === "undefined") return "high";
  const requested = new URLSearchParams(window.location.search).get("quality");
  return requested === "lite" ? "lite" : "high";
}

export const useLotStore = create<LotState>((set) => ({
  facility: null,
  spaces: [],
  stats: null,
  analytics: null,
  revenue: null,
  pricingRules: [],
  connection: "connecting",
  activity: [],
  receipts: [],
selectedBay: null,
pendingBays: [],
visualQuality: initialVisualQuality(),
  replayBays: null,
  towEvent: null,
  cameraLocked: false,
  cameraMode: "free",
  cameraResetToken: 0,
  paymentKioskOpen: false,
  auth: initialAuth,
  authenticating: false,
  authError: null,

  async hydrate() {
    const snapshot = await api.lot();

    // Revenue is a separate, heavier read. Fetched alongside the snapshot but
    // never allowed to take the dashboard down with it: the lot view is the
    // priority, the money panel can retry on its own.
    void api
      .revenue()
      .then((revenue) => useLotStore.setState({ revenue }))
      .catch(() => undefined);

    set({
      facility: snapshot.facility,
      spaces: snapshot.spaces,
      stats: snapshot.stats,
      analytics: snapshot.analytics,
      pricingRules: snapshot.pricingRules,
      connection: "live",
    });
  },

  applySnapshot(spaces, stats) {
    set({ spaces, stats });
  },

  setConnection(connection) {
    set({ connection });
  },

  setAnalytics(analytics) {
    set({ analytics });
  },

  setRevenue(revenue) {
    set({ revenue });
  },

  selectBay(spaceNumber) {
    set({ selectedBay: spaceNumber });
  },

  setVisualQuality(visualQuality) {
    set({ visualQuality });
  },

  setLiveBays(replayBays) {
    set({ replayBays });
  },

  async checkIn(spaceNumber, plate, vehicleType) {
    set((state) => ({ pendingBays: [...state.pendingBays, spaceNumber] }));
    try {
      await api.checkIn(spaceNumber, plate, vehicleType);
      // The WebSocket broadcast is the source of truth for the UI; the HTTP
      // call here only performs the mutation.
    } finally {
      set((state) => ({
        pendingBays: state.pendingBays.filter((bay) => bay !== spaceNumber),
      }));
    }
  },

  async checkOut(spaceNumber, method = "card") {
    set((state) => ({ pendingBays: [...state.pendingBays, spaceNumber] }));
    try {
      return await api.checkOut(spaceNumber, method);
    } finally {
      set((state) => ({
        pendingBays: state.pendingBays.filter((bay) => bay !== spaceNumber),
      }));
    }
  },

  async tow(spaceNumber) {
    set((state) => ({ pendingBays: [...state.pendingBays, spaceNumber] }));
    try {
      await api.tow(spaceNumber);
      // The broadcast that follows is what starts the tow in the scene; the
      // HTTP call only authorises it, so no visual state is set here.
    } finally {
      set((state) => ({
        pendingBays: state.pendingBays.filter((bay) => bay !== spaceNumber),
      }));
    }
  },

  beginTow(towEvent) {
    set({ towEvent });
    // The 3D layer is what clears this, so a session opened on the grid view
    // (or a canvas that never mounts) would otherwise latch the bay as hidden
    // for good. The scene normally finishes in well under a minute.
    scheduleTowWatchdog();
  },

  clearTow() {
    if (towWatchdog !== null) {
      clearTimeout(towWatchdog);
      towWatchdog = null;
    }
    set({ towEvent: null });
  },

  setCameraLocked(cameraLocked) {
    set({ cameraLocked });
  },

  setCameraMode(cameraMode) {
    set({ cameraMode });
  },

  resetCamera() {
    set((state) => ({ cameraResetToken: state.cameraResetToken + 1 }));
  },

  openPaymentKiosk() {
    set({ paymentKioskOpen: true });
  },

  closePaymentKiosk() {
    set({ paymentKioskOpen: false });
  },

  async login(username, password) {
    set({ authenticating: true, authError: null });
    try {
      const session = await api.login(username, password);
      const auth: AuthSession = {
        token: session.token,
        username: session.user.username,
        expiresAt: session.expiresAt,
      };

      setAuthToken(auth.token);
      persistAuth(auth);
      set({ auth, authenticating: false, authError: null });
    } catch (error) {
      set({
        authenticating: false,
        authError: error instanceof Error ? error.message : "Sign-in failed. Try again.",
      });
    }
  },

  logout() {
    setAuthToken(null);
    persistAuth(null);
    set({ auth: null, authError: null });
  },
}));

/**
 * A 401 from any request means the token lapsed or was rejected. Drop straight
 * back to the sign-in screen rather than leaving the console half-authenticated.
 * Guarded on `auth` so a failed *login* (which is also a 401) does not wipe the
 * error message the user needs to read.
 */
setUnauthorizedHandler(() => {
  if (useLotStore.getState().auth !== null) useLotStore.getState().logout();
});

/** Records a completed departure with its itemised bill for the receipt drawer. */
export function pushDepartureReceipt(
  session: ParkingSessionDto,
  payment: PaymentDto,
  lines: ReceiptItem["lines"],
): void {
  const receipt: ReceiptItem = {
    id: nextId(),
    kind: "departure",
    spaceNumber: session.spaceNumber,
    numberPlate: session.vehicle.numberPlate,
    vehicleType: session.vehicle.type,
    at: Date.now(),
    amount: payment.amount,
    reference: payment.reference,
    lines,
  };

  useLotStore.setState((state) => ({
    receipts: [receipt, ...state.receipts].slice(0, 40),
  }));
}

export function pushArrival(session: ParkingSessionDto): void {
  const entry: ActivityItem = {
    id: nextId(),
    kind: "arrival",
    spaceNumber: session.spaceNumber,
    numberPlate: session.vehicle.numberPlate,
    vehicleType: session.vehicle.type,
    at: Date.now(),
    amount: null,
  };

  useLotStore.setState((state) => ({
    activity: [entry, ...state.activity].slice(0, 60),
  }));
}

/** Records an enforcement removal in the live movement feed. */
export function pushTowActivity(session: ParkingSessionDto): void {
  const entry: ActivityItem = {
    id: nextId(),
    kind: "tow",
    spaceNumber: session.spaceNumber,
    numberPlate: session.vehicle.numberPlate,
    vehicleType: session.vehicle.type,
    at: Date.now(),
    amount: null,
  };

  useLotStore.setState((state) => ({
    activity: [entry, ...state.activity].slice(0, 60),
  }));
}

export function dismissReceipt(id: string): void {
  useLotStore.setState((state) => ({
    receipts: state.receipts.filter((receipt) => receipt.id !== id),
  }));
}

export function useSelectedSpace(): ParkingSpaceDto | null {
  return useLotStore((state) => {
    if (state.selectedBay === null) return null;
    return state.spaces.find((space) => space.spaceNumber === state.selectedBay) ?? null;
  });
}

