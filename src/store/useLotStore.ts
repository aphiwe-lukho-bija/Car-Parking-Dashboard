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
import { api } from "../api/client";

export interface ActivityItem {
  id: string;
  kind: "arrival" | "departure";
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

interface LotState {
  facility: FacilityDto | null;
  spaces: ParkingSpaceDto[];
  stats: LotStatsDto | null;
  analytics: AnalyticsDto | null;
  revenue: RevenueDto | null;
  pricingRules: PricingRule[];
  connection: ConnectionState;

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

  hydrate: () => Promise<void>;
  applySnapshot: (spaces: ParkingSpaceDto[], stats: LotStatsDto) => void;
  setConnection: (state: ConnectionState) => void;
  setAnalytics: (analytics: AnalyticsDto) => void;
  setRevenue: (revenue: RevenueDto) => void;
  selectBay: (spaceNumber: string | null) => void;
  setVisualQuality: (quality: VisualQuality) => void;
  setLiveBays: (bays: Set<string> | null) => void;
  checkIn: (spaceNumber: string, plate: string, type: VehicleType) => Promise<void>;
  checkOut: (spaceNumber: string) => Promise<void>;
}

let activityId = 0;
const nextId = () => `act-${(activityId += 1)}`;

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

  async checkOut(spaceNumber) {
    set((state) => ({ pendingBays: [...state.pendingBays, spaceNumber] }));
    try {
      await api.checkOut(spaceNumber);
    } finally {
      set((state) => ({
        pendingBays: state.pendingBays.filter((bay) => bay !== spaceNumber),
      }));
    }
  },
}));

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

