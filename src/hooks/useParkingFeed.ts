import { useEffect, useRef } from "react";
import type { ParkingSpaceDto, ServerEvent } from "@shared/types";
import { calculateParkingFee } from "@shared/pricing";
import { resolveRateCard } from "@shared/pricingRules";
import { api } from "../api/client";
import {
  pushArrival,
  pushDepartureReceipt,
  pushTowActivity,
  useLotStore,
} from "../store/useLotStore";

/**
 * Builds the URL for the API WebSocket.
 *
 * When the dev server proxies `/ws` to the API the current origin is reused, so
 * the client is same-origin and no CORS handshake is involved. Falling back to
 * `localhost:4000` covers running the client without the proxy.
 */
function socketUrl(): string {
  const configured = import.meta.env.VITE_WS_URL;
  let base = configured;
  if (typeof base !== "string" || base === "") {
    const { protocol, hostname, port } = window.location;
    const scheme = protocol === "https:" ? "wss:" : "ws:";
    base = `${scheme}//${hostname}:${port}/ws`;
  }

  // The live feed is behind the same sign-in as the REST API, so the socket
  // carries the operator's token on its URL.
  const token = useLotStore.getState().auth?.token ?? null;
  if (token === null) return base;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}token=${encodeURIComponent(token)}`;
}

/** Close code the hub uses when a socket presents no valid token. */
const UNAUTHORIZED_CLOSE = 4401;

const RECONNECT_BASE_MS = 700;
const RECONNECT_MAX_MS = 8000;

export function useParkingFeed(): void {
  const retryRef = useRef(0);
  const closedByUs = useRef(false);

  useEffect(() => {
    closedByUs.current = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = (): void => {
      const store = useLotStore.getState();
      store.setConnection(retryRef.current === 0 ? "connecting" : "reconnecting");

      socket = new WebSocket(socketUrl());

      socket.onopen = () => {
        retryRef.current = 0;
        useLotStore.getState().setConnection("live");
      };

      socket.onmessage = (event) => {
        let frame: ServerEvent;
        try {
          frame = JSON.parse(String(event.data)) as ServerEvent;
        } catch {
          return;
        }
        handleFrame(frame);
      };

      socket.onclose = (event) => {
        if (closedByUs.current) return;

        // The server refused the token: stop reconnecting and return to login.
        if (event.code === UNAUTHORIZED_CLOSE) {
          useLotStore.getState().logout();
          return;
        }

        useLotStore.getState().setConnection("offline");
        // Exponential backoff with a ceiling, so a server restart reconnects
        // promptly but a long outage does not hammer the API.
        const delay = Math.min(
          RECONNECT_BASE_MS * 2 ** retryRef.current,
          RECONNECT_MAX_MS,
        );
        retryRef.current += 1;
        retryTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    const handleFrame = (frame: ServerEvent): void => {
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
            upsertSpace(store.spaces, frame.payload.space),
            frame.payload.stats,
          );
          pushArrival(frame.payload.session);
          break;
        }

        case "session.closed": {
          store.applySnapshot(
            upsertSpace(store.spaces, frame.payload.space),
            frame.payload.stats,
          );

          // The server sends the total; the itemised lines are recomputed
          // locally from the same rate cards so the receipt can show how the
          // figure was reached without a second round trip.
          const rateCard = resolveRateCard(
            frame.payload.session.vehicle.type,
            store.pricingRules,
          );
          const breakdown = calculateParkingFee({
            checkInTime: new Date(frame.payload.session.checkInTime),
            checkOutTime: new Date(frame.payload.session.checkOutTime ?? Date.now()),
            rule: rateCard,
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

        case "tow.authorised": {
          store.applySnapshot(
            upsertSpace(store.spaces, frame.payload.space),
            frame.payload.stats,
          );

          // Hands the scene a subject: the fleet holds its mesh in the bay and
          // the tow sequence takes it from there.
          store.beginTow({
            sessionId: frame.payload.session.id,
            spaceNumber: frame.payload.session.spaceNumber,
            numberPlate: frame.payload.session.vehicle.numberPlate,
            vehicleType: frame.payload.session.vehicle.type,
            at: Date.now(),
          });

          pushTowActivity(frame.payload.session);

          // The stay settles like any other checkout, with the release fee
          // itemised underneath it so the receipt explains the total.
          const rateCard = resolveRateCard(
            frame.payload.session.vehicle.type,
            store.pricingRules,
          );
          const breakdown = calculateParkingFee({
            checkInTime: new Date(frame.payload.session.checkInTime),
            checkOutTime: new Date(frame.payload.session.checkOutTime ?? Date.now()),
            rule: rateCard,
          });
          const accrued = Math.round(breakdown.totalFee * 100) / 100;
          const release = Math.round((frame.payload.payment.amount - accrued) * 100) / 100;

          pushDepartureReceipt(
            frame.payload.session,
            frame.payload.payment,
            [
              ...breakdown.lines.map((line) => ({
                date: line.date,
                hours: line.hoursCharged,
                amount: line.amount,
                capped: line.capped,
              })),
              { date: "Tow release", hours: 0, amount: release, capped: false },
            ],
          );

          // Enforcement income landed with that payment, so the money panels
          // refresh instead of waiting out their own polling interval.
          void api
            .revenue()
            .then((revenue) => useLotStore.setState({ revenue }))
            .catch(() => undefined);
          break;
        }

        case "error":
          console.warn("[feed]", frame.payload.code, frame.payload.message);
          break;
      }
    };

    connect();

    return () => {
      closedByUs.current = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);
}

function upsertSpace(
  spaces: readonly ParkingSpaceDto[],
  next: ParkingSpaceDto,
): ParkingSpaceDto[] {
  const index = spaces.findIndex((space) => space.id === next.id);
  if (index === -1) return [...spaces, next];

  const copy = [...spaces];
  copy[index] = next;
  return copy;
}
