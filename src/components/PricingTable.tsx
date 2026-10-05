import { useState } from "react";
import { VEHICLE_TYPE_LABELS } from "@shared/types";
import { formatCurrency } from "@shared/format";
import { api } from "../api/client";
import { useLotStore } from "../store/useLotStore";
import { Panel } from "./Panel";

interface Draft {
  hourlyRate: string;
  dailyMaximum: string;
  gracePeriodMinutes: string;
}

/**
 * Live tariff editor.
 *
 * Each rule is committed on blur rather than on every keystroke, so a rate can
 * be retyped without the API receiving a partial number.
 */
export function PricingTable() {
  const rules = useLotStore((state) => state.pricingRules);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>({
    hourlyRate: "",
    dailyMaximum: "",
    gracePeriodMinutes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const beginEdit = (id: number, hourlyRate: number, dailyMaximum: number, grace: number): void => {
    setEditing(id);
    setError(null);
    setDraft({
      hourlyRate: String(hourlyRate),
      dailyMaximum: String(dailyMaximum),
      gracePeriodMinutes: String(grace),
    });
  };

  const commit = async (): Promise<void> => {
    if (editing === null) return;

    const hourlyRate = Number(draft.hourlyRate);
    const dailyMaximum = Number(draft.dailyMaximum);
    const gracePeriodMinutes = Number(draft.gracePeriodMinutes);

    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
      setError("Hourly rate must be greater than zero.");
      return;
    }
    if (!Number.isFinite(dailyMaximum) || dailyMaximum <= 0) {
      setError("Daily maximum must be greater than zero.");
      return;
    }
    if (!Number.isFinite(gracePeriodMinutes) || gracePeriodMinutes < 0) {
      setError("Grace period cannot be negative.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { pricingRule } = await api.updatePricing(editing, {
        hourlyRate,
        dailyMaximum,
        gracePeriodMinutes,
      });

      useLotStore.setState((state) => ({
        pricingRules: state.pricingRules.map((rule) =>
          rule.id === pricingRule.id ? pricingRule : rule,
        ),
      }));
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the tariff.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title="Tariffs"
      subtitle="Each day is billed up to its own maximum"
    >
      <table className="tariffs">
        <thead>
          <tr>
            <th scope="col">Vehicle</th>
            <th scope="col">Hourly</th>
            <th scope="col">Day max</th>
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id}>
              <th scope="row">{VEHICLE_TYPE_LABELS[rule.vehicleType]}</th>
              {editing === rule.id ? (
                <>
                  <td>
                    <input
                      aria-label={`${rule.vehicleType} hourly rate`}
                      value={draft.hourlyRate}
                      inputMode="decimal"
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, hourlyRate: event.target.value }))
                      }
                      onBlur={() => void commit()}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`${rule.vehicleType} daily maximum`}
                      value={draft.dailyMaximum}
                      inputMode="decimal"
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, dailyMaximum: event.target.value }))
                      }
                      onBlur={() => void commit()}
                    />
                  </td>
                  <td className="tariffs__actions">
                    <button
                      className="ghost"
                      type="button"
                      disabled={saving}
                      onClick={() => void commit()}
                    >
                      {saving ? "…" : "Save"}
                    </button>
                  </td>
                </>
              ) : (
                <>
                  <td>{formatCurrency(rule.hourlyRate)}</td>
                  <td>{formatCurrency(rule.dailyMaximum)}</td>
                  <td className="tariffs__actions">
                    <button
                      className="ghost"
                      type="button"
                      onClick={() =>
                        beginEdit(
                          rule.id,
                          rule.hourlyRate,
                          rule.dailyMaximum,
                          rule.gracePeriodMinutes,
                        )
                      }
                    >
                      Edit
                    </button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {error !== null && <p className="field__error">{error}</p>}

      <p className="muted tariffs__note">
        Vehicles are charged per started hour, with a grace period before the
        clock begins and a hard ceiling per calendar day.
      </p>
    </Panel>
  );
}