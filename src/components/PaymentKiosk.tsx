import { useEffect, useMemo, useState } from "react";
import { VEHICLE_TYPE_LABELS } from "@shared/types";
import { formatCurrency, formatDuration, formatPlate } from "@shared/format";
import { calculateParkingFee } from "@shared/pricing";
import { resolveRateCard } from "@shared/pricingRules";
import { useLotStore } from "../store/useLotStore";

/**
 * The customer-facing pay station.
 *
 * A kiosk view of the payment step: a driver walks up, finds their vehicle,
 * reads the bill and settles it. It is mounted over the console only while the
 * operator opens it, so it can be shown to an audience without exposing the
 * dashboard behind it.
 *
 * The flow is the one drivers expect from a real machine - find vehicle, read
 * the charge, choose a method, pay, receipt - and the final step genuinely
 * calls the same checkout endpoint the dashboard uses, so the bay frees up and
 * the car drives off in the 3D view exactly as it would from the operator's
 * controls.
 */

type Stage =
  | "welcome"
  | "select"
  | "amount"
  | "method"
  | "card"
  | "cash"
  | "scan"
  | "processing"
  | "done";

type Method = "card" | "cash" | "scan";

const METHOD_LABELS: Record<Method, string> = {
  card: "Card",
  cash: "Cash",
  scan: "SnapScan",
};

const QUICK_CASH = [50, 100, 200];

function elapsedMinutes(checkInTime: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(checkInTime).getTime()) / 60_000));
}

function formatCardNumber(value: string): string {
  return value
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function PaymentKiosk() {
  const spaces = useLotStore((state) => state.spaces);
  const pricingRules = useLotStore((state) => state.pricingRules);
  const checkOut = useLotStore((state) => state.checkOut);
  const close = useLotStore((state) => state.closePaymentKiosk);

  const [stage, setStage] = useState<Stage>("welcome");
  const [bay, setBay] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>("card");
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "" });
  const [tendered, setTendered] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<{ reference: string; amount: number } | null>(null);

  const occupied = useMemo(
    () => spaces.filter((space) => space.status === "occupied" && space.session !== null),
    [spaces],
  );

  const selected =
    bay === null ? null : occupied.find((space) => space.spaceNumber === bay) ?? null;

  const projection = useMemo(() => {
    if (selected?.session == null) return null;
    return calculateParkingFee({
      checkInTime: new Date(selected.session.checkInTime),
      checkOutTime: new Date(),
      rule: resolveRateCard(selected.session.vehicle.type, pricingRules),
    });
  }, [selected, pricingRules]);

  const due = projection?.totalFee ?? 0;
  const tenderedValue = Number(tendered) || 0;
  const change = Math.max(0, tenderedValue - due);
  const cardReady =
    card.number.replace(/\D/g, "").length === 16 &&
    card.expiry.replace(/\D/g, "").length === 4 &&
    card.cvc.replace(/\D/g, "").length === 3;

  // The checkout runs when the processing stage is reached, not on the button,
  // so the request and the "authorising" animation start together.
  useEffect(() => {
    if (stage !== "processing" || pending === null) return;
    let cancelled = false;

    checkOut(pending, method === "cash" ? "cash" : "card")
      .then((payload) => {
        if (cancelled) return;
        setResult({ reference: payload.payment.reference, amount: payload.payment.amount });
        setStage("done");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Payment could not be completed.");
        setStage("method");
      });

    return () => {
      cancelled = true;
    };
  }, [stage, pending, method, checkOut]);

  const beginPayment = (chosen: Method): void => {
    if (selected === null) return;
    setError(null);
    setMethod(chosen);
    setPending(selected.spaceNumber);
    setStage("processing");
  };

  const back = (): void => {
    setError(null);
    if (stage === "card" || stage === "cash" || stage === "scan") setStage("method");
    else if (stage === "method") setStage("amount");
    else if (stage === "amount") setStage("select");
    else if (stage === "select") setStage("welcome");
  };

  const canGoBack =
    stage === "select" || stage === "amount" || stage === "method" ||
    stage === "card" || stage === "cash" || stage === "scan";

  return (
    <div className="kiosk" role="dialog" aria-modal="true" aria-label="Apex Parking pay station">
      <div className="kiosk__terminal">
        <header className="kiosk__head">
          <div className="kiosk__brand">
            <span className="kiosk__mark" aria-hidden="true">
              P
            </span>
            <div>
              <p className="kiosk__name">Apex Parking</p>
              <p className="kiosk__tagline">Self-service pay station</p>
            </div>
          </div>
          <div className="kiosk__actions">
            {canGoBack && (
              <button className="kiosk__back" type="button" onClick={back}>
                Back
              </button>
            )}
            <button
              className="kiosk__exit"
              type="button"
              onClick={close}
              aria-label="Close pay station"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="kiosk__screen">
          {stage === "welcome" && (
            <div className="kiosk__pane kiosk__pane--welcome">
              <p className="kiosk__eyebrow">Welcome</p>
              <h2 className="kiosk__headline">Pay for your parking</h2>
              <p className="kiosk__sub">
                Find your vehicle, check what you owe and settle it here. Card, cash and
                SnapScan are all accepted.
              </p>
              <button className="kiosk__cta" type="button" onClick={() => setStage("select")}>
                Start
              </button>
            </div>
          )}

          {stage === "select" && (
            <div className="kiosk__pane">
              <p className="kiosk__eyebrow">Step 1 of 3</p>
              <h2 className="kiosk__headline">Which vehicle is yours?</h2>
              {occupied.length === 0 ? (
                <p className="kiosk__sub">No vehicles are currently parked. Nothing to pay.</p>
              ) : (
                <div className="kiosk__vehicles">
                  {occupied.map((space) => (
                    <button
                      key={space.spaceNumber}
                      type="button"
                      className="kiosk__vehicle"
                      onClick={() => {
                        setBay(space.spaceNumber);
                        setStage("amount");
                      }}
                    >
                      <strong>{space.spaceNumber}</strong>
                      <span>{formatPlate(space.vehicle?.numberPlate ?? "")}</span>
                      <em>
                        {space.session !== null
                          ? `${formatDuration(
                              elapsedMinutes(space.session.checkInTime),
                            )} · ${formatCurrency(space.session.runningFee)}`
                          : ""}
                      </em>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {stage === "amount" && selected?.session != null && (
            <div className="kiosk__pane">
              <p className="kiosk__eyebrow">Step 2 of 3 · Bay {selected.spaceNumber}</p>
              <h2 className="kiosk__headline">Your charge</h2>
              <div className="kiosk__facts">
                <div>
                  <span>Vehicle</span>
                  <strong>{formatPlate(selected.session.vehicle.numberPlate)}</strong>
                </div>
                <div>
                  <span>Type</span>
                  <strong>{VEHICLE_TYPE_LABELS[selected.session.vehicle.type]}</strong>
                </div>
                <div>
                  <span>Parked for</span>
                  <strong>{formatDuration(elapsedMinutes(selected.session.checkInTime))}</strong>
                </div>
              </div>

              {projection !== null && projection.lines.length > 0 && (
                <ul className="kiosk__lines">
                  {projection.lines.map((line) => (
                    <li key={line.date}>
                      <span>{line.date}</span>
                      <span>
                        {line.hoursCharged}h{line.capped ? " · capped" : ""}
                      </span>
                      <span>{formatCurrency(line.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="kiosk__total">
                <span>Total due</span>
                <strong>{formatCurrency(due)}</strong>
              </div>

              <button className="kiosk__cta" type="button" onClick={() => setStage("method")}>
                Continue
              </button>
            </div>
          )}

          {stage === "method" && (
            <div className="kiosk__pane">
              <p className="kiosk__eyebrow">Step 3 of 3 · {formatCurrency(due)}</p>
              <h2 className="kiosk__headline">How would you like to pay?</h2>
              {error !== null && <p className="kiosk__error">{error}</p>}
              <div className="kiosk__methods">
                <button type="button" className="kiosk__method" onClick={() => setStage("card")}>
                  <strong>Card</strong>
                  <span>Tap, insert or swipe</span>
                </button>
                <button type="button" className="kiosk__method" onClick={() => setStage("cash")}>
                  <strong>Cash</strong>
                  <span>Notes and coins</span>
                </button>
                <button type="button" className="kiosk__method" onClick={() => setStage("scan")}>
                  <strong>SnapScan</strong>
                  <span>Scan with your phone</span>
                </button>
              </div>
            </div>
          )}

          {stage === "card" && (
            <div className="kiosk__pane">
              <p className="kiosk__eyebrow">Card payment</p>
              <h2 className="kiosk__headline">{formatCurrency(due)}</h2>
              {error !== null && <p className="kiosk__error">{error}</p>}
              <label className="kiosk__field">
                <span>Card number</span>
                <input
                  inputMode="numeric"
                  autoComplete="cc-number"
                  placeholder="0000 0000 0000 0000"
                  value={card.number}
                  onChange={(event) =>
                    setCard((current) => ({
                      ...current,
                      number: formatCardNumber(event.target.value),
                    }))
                  }
                />
              </label>
              <div className="kiosk__split">
                <label className="kiosk__field">
                  <span>Expiry</span>
                  <input
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    placeholder="MM/YY"
                    value={card.expiry}
                    onChange={(event) =>
                      setCard((current) => ({ ...current, expiry: formatExpiry(event.target.value) }))
                    }
                  />
                </label>
                <label className="kiosk__field">
                  <span>CVV</span>
                  <input
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    placeholder="123"
                    value={card.cvc}
                    onChange={(event) =>
                      setCard((current) => ({
                        ...current,
                        cvc: event.target.value.replace(/\D/g, "").slice(0, 3),
                      }))
                    }
                  />
                </label>
              </div>
              <button
                className="kiosk__cta"
                type="button"
                disabled={!cardReady}
                onClick={() => beginPayment("card")}
              >
                Pay {formatCurrency(due)}
              </button>
            </div>
          )}

          {stage === "cash" && (
            <div className="kiosk__pane">
              <p className="kiosk__eyebrow">Cash payment</p>
              <h2 className="kiosk__headline">{formatCurrency(due)}</h2>
              {error !== null && <p className="kiosk__error">{error}</p>}
              <div className="kiosk__quick">
                <button type="button" onClick={() => setTendered(String(Math.ceil(due)))}>
                  Exact
                </button>
                {QUICK_CASH.map((amount) => (
                  <button key={amount} type="button" onClick={() => setTendered(String(amount))}>
                    {formatCurrency(amount)}
                  </button>
                ))}
              </div>
              <label className="kiosk__field">
                <span>Cash received</span>
                <input
                  inputMode="numeric"
                  placeholder="0"
                  value={tendered}
                  onChange={(event) => setTendered(event.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </label>
              <div className="kiosk__total kiosk__total--sm">
                <span>Change due</span>
                <strong>{formatCurrency(change)}</strong>
              </div>
              <button
                className="kiosk__cta"
                type="button"
                disabled={tenderedValue < due}
                onClick={() => beginPayment("cash")}
              >
                Confirm cash
              </button>
            </div>
          )}

          {stage === "scan" && (
            <div className="kiosk__pane kiosk__pane--scan">
              <p className="kiosk__eyebrow">SnapScan</p>
              <h2 className="kiosk__headline">{formatCurrency(due)}</h2>
              {error !== null && <p className="kiosk__error">{error}</p>}
              <div className="kiosk__qr" aria-hidden="true">
                {Array.from({ length: 64 }, (_, index) => (
                  <span
                    key={index}
                    className={(index * 7 + index * index) % 3 === 0 ? "is-on" : ""}
                  />
                ))}
              </div>
              <p className="kiosk__sub">
                Open SnapScan and scan the code, or tap below once you have paid.
              </p>
              <button className="kiosk__cta" type="button" onClick={() => beginPayment("scan")}>
                I&apos;ve paid
              </button>
            </div>
          )}

          {stage === "processing" && (
            <div className="kiosk__pane kiosk__pane--centre">
              <span className="spinner kiosk__spinner" aria-hidden="true" />
              <h2 className="kiosk__headline">Authorising…</h2>
              <p className="kiosk__sub">
                Please wait while we confirm your {METHOD_LABELS[method].toLowerCase()} payment.
              </p>
            </div>
          )}

          {stage === "done" && result !== null && (
            <div className="kiosk__pane kiosk__pane--centre">
              <p className="kiosk__eyebrow">Paid</p>
              <h2 className="kiosk__headline kiosk__headline--paid">
                {formatCurrency(result.amount)}
              </h2>
              <p className="kiosk__sub">
                Bay {pending} settled by {METHOD_LABELS[method].toLowerCase()}.
              </p>
              <p className="kiosk__ref">
                Reference <strong>{result.reference}</strong>
              </p>
              <div className="kiosk__done-actions">
                <button
                  className="kiosk__cta kiosk__cta--ghost"
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setBay(null);
                    setCard({ number: "", expiry: "", cvc: "" });
                    setTendered("");
                    setStage("welcome");
                  }}
                >
                  Pay another vehicle
                </button>
                <button className="kiosk__cta" type="button" onClick={close}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        <footer className="kiosk__foot">
          <span>Apex Parking · secure payment</span>
          <button type="button" className="kiosk__foot-exit" onClick={close}>
            Exit
          </button>
        </footer>
      </div>
    </div>
  );
}