import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency, formatTime } from "@shared/format";
import { api } from "../api/client";
import { useLotStore } from "../store/useLotStore";
import { Panel } from "./Panel";

/** Matches the revenue panel's cadence so the two never disagree. */
const REFRESH_MS = 15_000;

/**
 * Scrubs through the current operating day.
 *
 * The frames come from the session ledger rather than a stored occupancy
 * series, so what plays back is the same data the billing engine bills from.
 * While the operator is inside the day, live arrivals keep arriving and the
 * cursor is snapped forward to include them.
 */
export function ReplayPanel() {
  const setLive = useLotStore((state) => state.setLiveBays);
  const spaces = useLotStore((state) => state.spaces);

  const [frames, setFrames] = useState<ReplayPanelFrame[]>([]);
  const [meta, setMeta] = useState<ReplayMeta | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const replay = await api.replay();
      setFrames(replay.frames);
      setMeta({
        currency: replay.currency,
        totalRevenue: replay.totalRevenue,
        totalSessions: replay.totalSessions,
        peakOccupancy: replay.peakOccupancy,
        peakAt: replay.peakAt,
        live: replay.live,
        busiestBay: replay.busiestBay,
      });
      setCursor((current) => {
        if (current === null) return replay.frames.length - 1;
        return Math.min(current, replay.frames.length - 1);
      });
    } catch {
      // A failed replay should never take the rest of the rail down with it.
    }
  }, []);

  useEffect(() => {
    // Deferred to a timer rather than fetched in the effect body: the replay is
    // a back-reference to the day's ledger, so the first paint should not block
    // on it, and a failed load can retry on the next tick.
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);

    // Kick the first load off on the next tick so it is not a synchronous
    // setState inside the effect body, and fire immediately when the tab is
    // already visible so the panel is never empty on arrival.
    if (document.visibilityState === "visible") {
      const kick = window.setTimeout(() => void load(), 0);
      return () => {
        window.clearTimeout(kick);
        window.clearInterval(id);
      };
    }

    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }

    if (!playing || frames.length === 0) return;

    timer.current = window.setInterval(() => {
      setCursor((current) => {
        if (current === null) return frames.length - 1;
        const next = current + 1;
        if (next >= frames.length) {
          setPlaying(false);
          return frames.length - 1;
        }
        return next;
      });
    }, 320);

    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, [playing, frames.length]);

  const frame = cursor === null ? null : (frames[cursor] ?? null);
  const atLiveEdge = cursor === null || cursor >= frames.length - 1;

  // Rendered outside the header so the impure Date read is not evaluated inside
  // a prop expression during render.
  const frameClock = frame === null ? "—" : formatTime(new Date(frame.at));

  const bays = useMemo(() => new Set(frame?.bays ?? []), [frame]);

  // Drive the real lot layout while scrubbing, then hand it back untouched.
  useEffect(() => {
    if (frame === null) return;
    setLive(bays);
  }, [bays, frame, setLive]);

  useEffect(() => () => setLive(null), [setLive]);

  const known = new Set(spaces.map((space) => space.spaceNumber));

  return (
    <Panel
      title="Day replay"
      subtitle={
        meta === null ? "Loading the day's movements…" : atLiveEdge ? `Live · ${frameClock}` : frameClock
      }
      action={
        <div className="replay__actions">
          <button
            type="button"
            className="replay__button"
            onClick={() => {
              if (!playing) setCursor(0);
              setPlaying((value) => !value);
            }}
            disabled={frames.length === 0}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            className="replay__button replay__button--live"
            onClick={() => {
              setPlaying(false);
              setCursor(null);
              setLive(null);
            }}
          >
            Live
          </button>
        </div>
      }
    >
      <div className="replay">
        <div className="replay__track">
          <div
            className="replay__occupancy"
            style={{ height: `${occupancyPercent(frame)}%` }}
            aria-hidden="true"
          />
          <input
            className="replay__scrubber"
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            value={cursor ?? Math.max(0, frames.length - 1)}
            onChange={(event) => {
              setPlaying(false);
              setCursor(Number(event.target.value));
            }}
            aria-label="Scrub through the day"
          />
        </div>

        <dl className="replay__figures">
          <div>
            <dt>On site</dt>
            <dd>
              {frame === null
                ? "—"
                : `${frame.occupied} / ${frame.capacity}`}
            </dd>
          </div>
          <div>
            <dt>Collected</dt>
            <dd>
              {frame === null
                ? "—"
                : formatCurrency(frame.revenue, meta?.currency ?? "ZAR")}
            </dd>
          </div>
          <div>
            <dt>Movements</dt>
            <dd>
              {frame === null
                ? "—"
                : `+${frame.arrivals} / −${frame.departures}`}
            </dd>
          </div>
        </dl>

        {frame !== null && bays.size > 0 ? (
          <p className="replay__bays">
            Held:{" "}
            {[...bays]
              .filter((bay) => known.has(bay))
              .sort()
              .slice(0, 12)
              .join(", ")}
            {bays.size > 12 ? ` +${bays.size - 12} more` : ""}
          </p>
        ) : null}

        {meta?.busiestBay != null ? (
          <p className="replay__note">
            Busiest bay <strong>{meta.busiestBay.spaceNumber}</strong> — held{" "}
            {Math.round(meta.busiestBay.hours)}h across {meta.busiestBay.sessions}{" "}
            visits today.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

interface ReplayPanelFrame {
  at: string;
  occupied: number;
  capacity: number;
  revenue: number;
  bays: string[];
  arrivals: number;
  departures: number;
}

interface ReplayMeta {
  currency: string;
  totalRevenue: number;
  totalSessions: number;
  peakOccupancy: number;
  peakAt: string | null;
  live: boolean;
  busiestBay: { spaceNumber: string; sessions: number; hours: number } | null;
}

const occupancyPercent = (frame: ReplayPanelFrame | null): number => {
  if (frame === null || frame.capacity === 0) return 0;
  return Math.min(100, Math.round((frame.occupied / frame.capacity) * 100));
};