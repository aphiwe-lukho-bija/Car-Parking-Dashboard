import { calculateParkingFee } from "../src/utils/pricingCalculator";

const checkInTime = new Date("2026-08-15T10:00:00");
const checkOutTime = new Date("2026-08-15T12:30:00");

const gracePeriodMinutes = 10;
const hourlyRate = 15;
const dailyMaximum = 100;

try {
  const parkingFee = calculateParkingFee({
    checkInTime,
    checkOutTime,
    gracePeriodMinutes,
    hourlyRate,
    dailyMaximum,
  });

  console.log("=== Mall Parking Fee Calculator ===");
  console.log(`Check-in time: ${checkInTime.toLocaleTimeString()}`);
  console.log(`Check-out time: ${checkOutTime.toLocaleTimeString()}`);
  console.log(`Grace period: ${gracePeriodMinutes} minutes`);
  console.log(`Hourly rate: R${hourlyRate}`);
  console.log(`Daily maximum: R${dailyMaximum}`);
  console.log("-----------------------------------");
  console.log(`Parking fee: R${parkingFee}`);
} catch (error) {
  console.error("Error calculating parking fee.");
}