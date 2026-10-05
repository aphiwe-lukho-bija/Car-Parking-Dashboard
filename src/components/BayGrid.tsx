import { useMemo, useState } from "react";
import { VEHICLE_TYPE_LABELS, type SpaceStatus, type VehicleType } from "@shared/types";
import { formatPlate } from "@shared/format";
import { useLotStore } from "../store/useLotStore";
import { projectBaysForReplay } from "./replayOccupancy";

type Filter = "all" | SpaceStatus | VehicleType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "available", label: "Free" },
  { value: "occupied", label: "Occupied" },
  { value: "car", label: "Cars" },
  { value: "suv", label: "SUVs" },
  { value: "motorbike", label: "Bikes" },
  { value: "truck", label: "Trucks" },
];

/** Compact, dense view of every bay — the operator's alternative to the 3D lot. */
export function BayGrid() {
  const spaces = useLotStore((state) => state.spaces);
  const selected = useLotStore((state) => state.selectedBay);
  const selectBay = useLotStore((state) => state.selectBay);
  const replayBays = useLotStore((state) => state.replayBays);
  const [filter, setFilter] = useState<Filter>("all");

  // While the replay is scrubbed the lot is shown as it stood at that instant,
  // so a bay the operator currently believes is free can correctly render as
  // occupied.
  const effective = useMemo(
    () => projectBaysForReplay(spaces, replayBays),
    [spaces, replayBays],
  );

  const visible = useMemo(() => {
    if (filter === "all") return effective;

    return effective.filter((space) => {
      if (filter === "available" || filter === "occupied" || filter === "reserved") {
        return space.status === filter;
      }
      return space.type === filter;
    });
  }, [effective, filter]);

  const sections = useMemo(() => {
    const grouped = new Map<string, typeof visible>();
    for (const space of visible) {
      const row = grouped.get(space.section) ?? [];
      row.push(space);
      grouped.set(space.section, row);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  return (
    <div className="grid">
      <div className="grid__filters" role="tablist" aria-label="Filter bays">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={filter === option.value}
            className={`chip ${filter === option.value ? "chip--active" : ""}`}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {sections.length === 0 && (
        <p className="empty">No bays match that filter.</p>
      )}

      {sections.map(([section, bays]) => (
        <div key={section} className="grid__section">
          <p className="grid__legend">
            <span>Zone {section}</span>
            <small>{VEHICLE_TYPE_LABELS[bays[0]?.type ?? "car"]}</small>
          </p>
          <div className="grid__row">
            {bays.map((space) => (
              <button
                key={space.id}
                type="button"
                className={`bay bay--${space.status} ${
                  selected === space.spaceNumber ? "bay--selected" : ""
                }`}
                onClick={() =>
                  selectBay(selected === space.spaceNumber ? null : space.spaceNumber)
                }
                title={`${space.spaceNumber} · ${space.status}`}
              >
                <span className="bay__id">{space.spaceNumber.split("-")[1]}</span>
                <span className="bay__plate">
                  {space.session === null ? "—" : formatPlate(space.session.vehicle.numberPlate)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}