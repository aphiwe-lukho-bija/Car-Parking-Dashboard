import { calculateParkingFee } from "../shared/pricing";
import { resolveRateCard } from "../shared/pricingRules";
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
} from "../shared/format";
import { VEHICLE_TYPE_LABELS, type VehicleType } from "../shared/types";

interface Scenario {
  label: string;
  checkIn: string;
  checkOut: string;
  vehicleType: VehicleType;
}

const scenarios: Scenario[] = [
  {
    label: "Quick shop (inside grace period)",
    checkIn: "2026-08-15T10:00:00",
    checkOut: "2026-08-15T10:08:00",
    vehicleType: "car",
  },
  {
    label: "Lunch visit (started-hour rule)",
    checkIn: "2026-08-15T10:00:00",
    checkOut: "2026-08-15T12:30:00",
    vehicleType: "car",
  },
  {
    label: "Full day (daily maximum applies)",
    checkIn: "2026-08-15T08:00:00",
    checkOut: "2026-08-15T21:00:00",
    vehicleType: "car",
  },
  {
    label: "Overnight crossing midnight",
    checkIn: "2026-08-15T23:00:00",
    checkOut: "2026-08-16T01:00:00",
    vehicleType: "car",
  },
  {
    label: "Three-day event (capped per day)",
    checkIn: "2026-08-15T10:00:00",
    checkOut: "2026-08-18T10:00:00",
    vehicleType: "car",
  },
  {
    label: "Motorbike day rate",
    checkIn: "2026-08-15T09:00:00",
    checkOut: "2026-08-15T19:00:00",
    vehicleType: "motorbike",
  },
];

function run(scenario: Scenario): void {
  const checkInTime = new Date(scenario.checkIn);
  const checkOutTime = new Date(scenario.checkOut);
  const rule = resolveRateCard(scenario.vehicleType);

  try {
    const breakdown = calculateParkingFee({
      checkInTime,
      checkOutTime,
      rule,
    });

    console.log(`\n${scenario.label}`);
    console.log(
      `  Vehicle        ${VEHICLE_TYPE_LABELS[scenario.vehicleType]} @ ${formatCurrency(rule.hourlyRate)}/hr, cap ${formatCurrency(rule.dailyMaximum)}`,
    );
    console.log(`  Check-in       ${formatDateTime(checkInTime)}`);
    console.log(`  Check-out      ${formatDateTime(checkOutTime)}`);
    console.log(`  Duration       ${formatDuration(breakdown.totalMinutes)}`);

    if (breakdown.graceApplied) {
      console.log(
        `  Grace period   applied (${rule.gracePeriodMinutes} min) - no charge`,
      );
    } else {
      for (const line of breakdown.lines) {
        const capNote = line.capped ? " (daily max applied)" : "";
        console.log(
          `    ${line.date}  ${formatDuration(line.minutes).padStart(7)}  ->  ${String(line.hoursCharged).padStart(2)} hr  =  ${formatCurrency(line.amount)}${capNote}`,
        );
      }
    }

    console.log(`  TOTAL          ${formatCurrency(breakdown.totalFee, breakdown.currency)}`);
  } catch (error) {
    console.error(`  Error: ${(error as Error).message}`);
  }
}

console.log("=== Mall Parking Fee Calculator ===");
scenarios.forEach(run);