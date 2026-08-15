export interface PricingRule {
  id: number;
  vehicleType: "car" | "SUV" | "truck" | "motorbike";
  gracePeriodMinutes: number;
  hourlyRate: number;
  dailyMaximum: number;
}