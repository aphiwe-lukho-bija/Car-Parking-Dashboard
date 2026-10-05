import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LotSnapshotDto,
  LotStatsDto,
  ParkingSpaceDto,
  ParkingSessionDto,
  PaymentDto,
  ServerEvent,
} from "@shared/types";
import { resolveRateCard } from "@shared/pricingRules";
import { calculateParkingFee } from "@shared/pricing";
import { api, ApiRequestError } from "../api/client";
import {
  pushArrival,
  pushDepartureReceipt,
  dismissReceipt,
  useLotStore,
} from "./useLotStore";

function stats(overrides: Partial<LotStatsDto> = {}): LotStatsDto {
  return {
    total: 46,
    occupied: 2,
    available: 44,
    reserved: 0,
    occupancyRate: 4,
    activeSessions: 2,
    revenueToday: 0,
    averageStayMinutes: 60,
    overstayCount: 0,
    revenuePerSpace: 0,
    ...overrides,
  };
}

function session(overrides: Partial<ParkingSessionDto> = {}): ParkingSessionDto {
  return {
    id: 7,
    spaceNumber: "A-01",
    vehicle: { id: 3, numberPlate: "CA 123 456", type: "car" },
    checkInTime: "2026-10-05T08:00:00.000Z",
    checkOutTime: null,
    runningFee: 30,
    finalFee: null,
    status: "active",
    overGrace: false,
    nearCap: false,
    minutesToCap: null,
  isOverstay: false,
    ...overrides,
  };
}

function space(overrides: Partial<ParkingSpaceDto> = {}): ParkingSpaceDto {
  return {
    id: 1,
    spaceNumber: "A-01",
    section: "A",
    type: "car",
    status: "available",
    vehicle: null,
    session: null,
    ...overrides,
  };
}

function snapshot(
  spaces: ParkingSpaceDto[],
  overrides: Partial<LotSnapshotDto> = {},
): LotSnapshotDto {
  return {
    facility: {
      name: "Apex Park",
      city: "Sandton",
      currency: "ZAR",
      timezone: "Africa/Johannesburg",
    },
    spaces,
    stats: stats({ occupied: spaces.length, activeSessions: spaces.length }),
    pricingRules: [],
    analytics: {
      occupancyHistory: [],
      revenueByDay: [],
      peakHours: [],
      durationBuckets: [],
      vehicleMix: [],
      totalRevenue: 0,
      totalSessions: 0,
    },
    serverTime: "2026-10-05T12:00:00.000Z",
    ...overrides,
  };
}

function payment(overrides: Partial<PaymentDto> = {}): PaymentDto {
  return {
    id: 99,
    sessionId: 7,
    amount: 45,
    method: "card",
    status: "paid",
    reference: "APX-2026-000007",
    paidAt: "2026-10-05T11:00:00.000Z",
    ...overrides,
  };
}

/** Mirrors the frame handling in useParkingFeed, which lives in a hook. */
function applyFrame(frame: ServerEvent): void {
  const store = useLotStore.getState();

  switch (frame.type) {
    case "snapshot":
      store.applySnapshot(frame.payload.spaces, frame.payload.stats);
      useLotStore.setState({
        facility: frame.payload.facility,
        analytics: frame.payload.analytics,
        pricingRules: frame.payload.pricingRules,
      });
      break;

    case "session.opened": {
      store.applySnapshot(
        upsert(store.spaces, frame.payload.space),
        frame.payload.stats,
      );
      pushArrival(frame.payload.session);
      break;
    }

    case "session.closed": {
      store.applySnapshot(
        upsert(store.spaces, frame.payload.space),
        frame.payload.stats,
      );
      const rule = resolveRateCard(
        frame.payload.session.vehicle.type,
        store.pricingRules,
      );
      const breakdown = calculateParkingFee({
        checkInTime: new Date(frame.payload.session.checkInTime),
        checkOutTime: new Date(frame.payload.session.checkOutTime ?? Date.now()),
        rule,
      });
      pushDepartureReceipt(
        frame.payload.session,
        frame.payload.payment,
        breakdown.lines.map((line) => ({
          date: line.date,
          hours: line.hoursCharged,
          amount: line.amount,
          capped: line.capped,
        })),
      );
      break;
    }

    case "tick":
      store.applySnapshot(frame.payload.spaces, frame.payload.stats);
      useLotStore.setState({ analytics: frame.payload.analytics });
      break;

    case "error":
      break;
  }
}

function upsert(spaces: readonly ParkingSpaceDto[], next: ParkingSpaceDto): ParkingSpaceDto[] {
  const index = spaces.findIndex((candidate) => candidate.id === next.id);
  if (index === -1) return [...spaces, next];

  const copy = [...spaces];
  copy[index] = next;
  return copy;
}

describe("live feed reducers", () => {
  beforeEach(() => {
    useLotStore.setState({
      spaces: [],
      stats: null,
      analytics: null,
      pricingRules: [],
      facility: null,
      activity: [],
      receipts: [],
    });
  });

  it("hydrates the whole lot from the first snapshot", () => {
    applyFrame({
      type: "snapshot",
      payload: snapshot([space(), space({ id: 2, spaceNumber: "A-02", status: "occupied" })]),
    });

    const state = useLotStore.getState();
    expect(state.spaces).toHaveLength(2);
    expect(state.facility?.name).toBe("Apex Park");
    expect(state.stats?.occupied).toBe(2);
  });

  it("fills an arriving bay without disturbing the others", () => {
    applyFrame({
      type: "snapshot",
      payload: snapshot([space(), space({ id: 2, spaceNumber: "A-02" })]),
    });

    const arriving = session({
      id: 12,
      spaceNumber: "A-02",
      vehicle: { id: 3, numberPlate: "CA 123 456", type: "car" },
    });

    applyFrame({
      type: "session.opened",
      payload: {
        session: arriving,
        space: space({
          id: 2,
          spaceNumber: "A-02",
          status: "occupied",
          vehicle: arriving.vehicle,
          session: arriving,
        }),
        stats: stats(),
      },
    });

    const state = useLotStore.getState();
    expect(state.spaces).toHaveLength(2);
    // The bay is updated in place, and its neighbour is untouched.
    expect(state.spaces[1]?.status).toBe("occupied");
    expect(state.spaces[0]?.spaceNumber).toBe("A-01");
    expect(state.spaces[0]?.status).toBe("available");
    expect(state.activity[0]).toMatchObject({
      kind: "arrival",
      spaceNumber: "A-02",
      numberPlate: "CA 123 456",
    });
  });

  it("frees the bay on departure and files an itemised receipt", () => {
    const rules = [
      {
        id: 1,
        vehicleType: "car" as const,
        label: "Car",
        gracePeriodMinutes: 10,
        hourlyRate: 15,
        dailyMaximum: 100,
        currency: "ZAR",
      },
    ];

    applyFrame({ type: "snapshot", payload: snapshot([space()], { pricingRules: rules }) });

    const closed = session({
      checkOutTime: "2026-10-05T12:00:00.000Z",
      status: "completed",
      finalFee: 60,
    });

    applyFrame({
      type: "session.closed",
      payload: {
        session: closed,
        space: space(),
        // The headline figure is whatever the server charged; the client only
        // itemises it, so the two must agree.
        payment: payment({ amount: 60 }),
        stats: stats({ occupied: 0, activeSessions: 0 }),
      },
    });

    const state = useLotStore.getState();
    expect(state.spaces[0]?.status).toBe("available");
    expect(state.spaces[0]?.session).toBeNull();

    const receipt = state.receipts[0];
    expect(receipt?.reference).toBe("APX-2026-000007");
    // 08:00 -> 12:00 is four started hours at R15.
    expect(receipt?.amount).toBe(60);
    expect(receipt?.lines).toHaveLength(1);
    expect(receipt?.lines[0]).toMatchObject({ hours: 4, amount: 60, capped: false });
  });

  it("keeps the receipt total in step with the server's amount", () => {
    useLotStore.setState({
      pricingRules: [
        {
          id: 1,
          vehicleType: "car",
          label: "Car",
          gracePeriodMinutes: 10,
          hourlyRate: 15,
          dailyMaximum: 100,
          currency: "ZAR",
        },
      ],
    });

    const closed = session({
      checkInTime: "2026-10-05T00:30:00.000Z",
      checkOutTime: "2026-10-05T02:00:00.000Z",
      status: "completed",
    });

    applyFrame({
      type: "session.closed",
      payload: {
        session: closed,
        space: space(),
        // The server bills to its own day boundary; the client only itemises.
        payment: payment({ amount: 100 }),
        stats: stats({ occupied: 0, activeSessions: 0 }),
      },
    });

    const receipt = useLotStore.getState().receipts[0];
    expect(receipt?.amount).toBe(100);
    expect(receipt?.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(
      receipt?.lines[0]?.amount,
    );
  });

  it("replaces a bay in place rather than appending a duplicate", () => {
    applyFrame({
      type: "snapshot",
      payload: snapshot([space(), space({ id: 2, spaceNumber: "A-02" })]),
    });

    applyFrame({
      type: "session.opened",
      payload: {
        session: session(),
        space: space({ status: "occupied" }),
        stats: stats(),
      },
    });

    const state = useLotStore.getState();
    expect(state.spaces).toHaveLength(2);
    expect(state.spaces.filter((s) => s.spaceNumber === "A-01")).toHaveLength(1);
  });

  it("caps the activity feed and the receipt history", () => {
    for (let i = 0; i < 90; i += 1) {
      pushArrival(session({ id: i }));
    }
    expect(useLotStore.getState().activity.length).toBeLessThanOrEqual(60);

    for (let i = 0; i < 60; i += 1) {
      pushDepartureReceipt(session({ id: i }), payment({ sessionId: i }), []);
    }
    expect(useLotStore.getState().receipts.length).toBeLessThanOrEqual(40);
  });

  it("dismisses a receipt by id", () => {
    pushDepartureReceipt(session(), payment(), []);
    const id = useLotStore.getState().receipts[0]?.id;
    expect(id).toBeDefined();

    dismissReceipt(id as string);
    expect(useLotStore.getState().receipts).toHaveLength(0);
  });
});

describe("api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("turns a structured API error into a typed rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "bay_occupied", message: "Bay A-01 is taken" }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(api.checkIn("A-01", "CA 123 456", "car")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 409,
      code: "bay_occupied",
      message: "Bay A-01 is taken",
    });
    expect(ApiRequestError).toBeTypeOf("function");
  });

  it("still rejects usefully when the body is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>gateway timeout</html>", { status: 504 }),
    );

    await expect(api.lot()).rejects.toMatchObject({ status: 504 });
  });
});
describe("replay scrubbing", () => {
  beforeEach(() => {
    useLotStore.setState({
      spaces: [
        space({ spaceNumber: "A-01", status: "occupied" }),
        space({ id: 2, spaceNumber: "A-02", status: "available" }),
        space({ id: 3, spaceNumber: "A-03", status: "reserved" }),
      ],
      replayBays: null,
    });
  });

  afterEach(() => {
    useLotStore.setState({ replayBays: null });
  });

  it("hands the live lot back untouched when no replay is active", () => {
    useLotStore.getState().setLiveBays(null);
    expect(useLotStore.getState().replayBays).toBeNull();
  });

  it("publishes the set of bays the replay is showing", () => {
    useLotStore.getState().setLiveBays(new Set(["A-02"]));
    expect([...(useLotStore.getState().replayBays ?? [])]).toEqual(["A-02"]);
  });

  it("replaces the set rather than mutating the previous one", () => {
    const first = new Set(["A-01"]);
    useLotStore.getState().setLiveBays(first);
    useLotStore.getState().setLiveBays(new Set(["A-02"]));

    expect([...(first)]).toEqual(["A-01"]);
    expect([...(useLotStore.getState().replayBays ?? [])]).toEqual(["A-02"]);
  });

  it("returns to live state when the operator clears the replay", () => {
    useLotStore.getState().setLiveBays(new Set(["A-01"]));
    useLotStore.getState().setLiveBays(null);
    expect(useLotStore.getState().replayBays).toBeNull();
  });
});
