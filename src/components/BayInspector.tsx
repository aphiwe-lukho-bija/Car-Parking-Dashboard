import { useMemo, useState } from "react";
import {
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  type VehicleType,
} from "@shared/types";
import { formatCurrency, formatDuration, formatPlate } from "@shared/format";
import { calculateParkingFee } from "@shared/pricing";
import { resolveRateCard } from "@shared/pricingRules";
import { useLotStore, useSelectedSpace } from "../store/useLotStore";
import { Badge, Panel } from "./Panel";

const PROVINCES = ["CA", "GP", "KZN", "WC", "MP", "NW"];
const PLATE_LETTERS = "ABCDEFGHJKLMNPRSTVWXYZ";

/** Builds a plausible-looking SA plate purely as an input placeholder. */
function generatePlate(): string {
  const pick = (source: readonly string[] | string): string => {
    const character = source[Math.floor(Math.random() * source.length)];
    return character ?? "A";
  };

  const province = pick(PROVINCES);
  const digits = Math.floor(Math.random() * 1000);

  return `${province} ${pick(PLATE_LETTERS)}${pick(PLATE_LETTERS)}${pick(PLATE_LETTERS)} ${digits}`;
}

export function BayInspector() {
  const space = useSelectedSpace();
  const pricingRules = useLotStore((state) => state.pricingRules);
  const pendingBays = useLotStore((state) => state.pendingBays);
  const selectBay = useLotStore((state) => state.selectBay);
  const checkIn = useLotStore((state) => state.checkIn);
  const checkOut = useLotStore((state) => state.checkOut);

  const [plate, setPlate] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>(
    space?.type ?? "car",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const suggestedType = space?.type ?? "car";
  const busyHere = space !== null && pendingBays.includes(space.spaceNumber);

  const projection = useMemo(() => {
    if (space?.session == null) return null;
    const rule = resolveRateCard(space.session.vehicle.type, pricingRules);
    return calculateParkingFee({
      checkInTime: new Date(space.session.checkInTime),
      checkOutTime: new Date(),
      rule,
    });
  }, [space, pricingRules]);

  if (space === null) {
    return (
      <Panel title="Bay inspector">
        <p className="empty">
          Select any bay on the lot — or a row in the grid — to issue a ticket,
          release a vehicle or read its current tariff.
        </p>
      </Panel>
    );
  }

  const occupied = space.status === "occupied" && space.session !== null;

  const submit = async (): Promise<void> => {
    const normalised = plate.trim().toUpperCase();
    if (normalised.length < 5) {
      setError("Enter a valid number plate.");
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await checkIn(space.spaceNumber, normalised, vehicleType);
      setPlate("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const release = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await checkOut(space.spaceNumber);
      selectBay(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check-out failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title={`Bay ${space.spaceNumber}`}
      subtitle={`Zone ${space.section} · ${VEHICLE_TYPE_LABELS[space.type]}`}
      action={
        <button className="ghost" onClick={() => selectBay(null)} type="button">
          Close
        </button>
      }
    >
      {occupied && space.session !== null ? (
        <div className="inspector">
          <div className="inspector__row">
            <Badge tone="live">Occupied</Badge>
            <span className="inspector__plate">
              {formatPlate(space.session.vehicle.numberPlate)}
            </span>
          </div>

          <dl className="facts">
            <div>
              <dt>Vehicle</dt>
              <dd>{VEHICLE_TYPE_LABELS[space.session.vehicle.type]}</dd>
            </div>
            <div>
              <dt>Arrived</dt>
              <dd>
                {new Date(space.session.checkInTime).toLocaleTimeString("en-ZA", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </dd>
            </div>
            <div>
              <dt>Elapsed</dt>
              <dd>{formatDuration(elapsedMinutes(space.session.checkInTime))}</dd>
            </div>
            <div>
              <dt>Running fee</dt>
              <dd>{formatCurrency(space.session.runningFee)}</dd>
            </div>
          </dl>

          {space.session.overGrace && (
            <p className="notice notice--warn">
              Grace period exceeded — the clock is now billing.
            </p>
          )}
          {space.session.nearCap && (
            <p className="notice notice--gold">
              Daily maximum approaching
              {space.session.minutesToCap !== null
                ? ` in ${formatDuration(space.session.minutesToCap)}`
                : ""}
              . The fee will not rise beyond the cap today.
            </p>
          )}

          {projection !== null && (
            <div className="quote">
              <div className="quote__head">
                <span>Running total</span>
                <strong>{formatCurrency(projection.totalFee)}</strong>
              </div>
              <ul className="quote__lines">
                {projection.lines.map((line) => (
                  <li key={line.date}>
                    <span>{line.date}</span>
                    <span className="quote__hours">
                      {line.hoursCharged.toFixed(1)}h
                      {line.capped && <em>capped</em>}
                    </span>
                    <span>{formatCurrency(line.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            className="button button--danger"
            onClick={() => void release()}
            disabled={busy || busyHere}
            type="button"
          >
            {busy || busyHere ? "Processing…" : "Release bay & take payment"}
          </button>
        </div>
      ) : (
        <div className="inspector">
          <div className="inspector__row">
            <Badge tone="live">Available</Badge>
            <span className="muted">{VEHICLE_TYPE_LABELS[space.type]} bay</span>
          </div>

          <label className="field">
            <span>Number plate</span>
            <input
              value={plate}
              onChange={(event) => setPlate(event.target.value.toUpperCase())}
              placeholder={generatePlate()}
              spellCheck={false}
              maxLength={10}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
            />
          </label>

          <label className="field">
            <span>Vehicle type</span>
            <select
              value={vehicleType}
              onChange={(event) => setVehicleType(event.target.value as VehicleType)}
            >
              {VEHICLE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {VEHICLE_TYPE_LABELS[type]}
                  {type === suggestedType ? " — recommended" : ""}
                </option>
              ))}
            </select>
          </label>

          {error !== null && <p className="field__error">{error}</p>}

          <button
            className="button"
            onClick={() => void submit()}
            disabled={busy || busyHere}
            type="button"
          >
            {busy || busyHere ? "Issuing…" : "Issue ticket"}
          </button>
        </div>
      )}
    </Panel>
  );
}

/** Minutes a session has been open, rounded down. */
function elapsedMinutes(checkInTime: string): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(checkInTime).getTime()) / 60_000),
  );
}
