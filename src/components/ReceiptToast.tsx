import { useEffect } from "react";
import { formatCurrency, formatPlate } from "@shared/format";
import { VEHICLE_TYPE_LABELS } from "@shared/types";
import { dismissReceipt, useLotStore } from "../store/useLotStore";

const AUTO_DISMISS_MS = 9000;

function ReceiptToast() {
  const receipts = useLotStore((state) => state.receipts);
  const dismiss = dismissReceipt;
  const latest = receipts[0];

  useEffect(() => {
    if (latest === undefined) return;
    const timer = setTimeout(() => dismiss(latest.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [latest, dismiss]);

  if (latest === undefined) return null;

  return (
    <div className="receipt" role="status" aria-live="polite">
      <header className="receipt__head">
        <span className="receipt__tag">Payment captured</span>
        <button
          className="ghost"
          onClick={() => dismiss(latest.id)}
          type="button"
          aria-label="Dismiss receipt"
        >
          ✕
        </button>
      </header>

      <p className="receipt__amount">{formatCurrency(latest.amount)}</p>

      <div className="receipt__meta">
        <span>{formatPlate(latest.numberPlate)}</span>
        <span>{VEHICLE_TYPE_LABELS[latest.vehicleType]}</span>
        <span>Bay {latest.spaceNumber}</span>
      </div>

      <ul className="receipt__lines">
        {latest.lines.map((line) => (
          <li key={line.date}>
            <span>{line.date}</span>
            <span className="receipt__hours">
              {line.hours.toFixed(1)}h{line.capped && <em>cap</em>}
            </span>
            <span>{formatCurrency(line.amount)}</span>
          </li>
        ))}
      </ul>

      <p className="receipt__ref">Ref {latest.reference}</p>
    </div>
  );
}

export { ReceiptToast };