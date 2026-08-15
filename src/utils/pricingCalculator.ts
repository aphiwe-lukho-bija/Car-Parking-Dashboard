interface ParkingFeeInput {
  checkInTime: Date;
  checkOutTime: Date;
  gracePeriodMinutes: number;
  hourlyRate: number;
  dailyMaximum: number;
}

export function calculateParkingFee({
  checkInTime,
  checkOutTime,
  gracePeriodMinutes,
  hourlyRate,
  dailyMaximum,
}: ParkingFeeInput): number {
  const durationMilliseconds =
    checkOutTime.getTime() - checkInTime.getTime();

  const durationMinutes = durationMilliseconds / (1000 * 60);

  // Checkout cannot happen before check-in
  if (durationMinutes < 0) {
    throw new Error("Check-out time cannot be before check-in time.");
  }

  // Visits within the grace period are free
  if (durationMinutes <= gracePeriodMinutes) {
    return 0;
  }

  // Charge for every started hour
  const hoursCharged = Math.ceil(durationMinutes / 60);

  const calculatedFee = hoursCharged * hourlyRate;

  // Never charge more than the daily maximum
  return Math.min(calculatedFee, dailyMaximum);
}