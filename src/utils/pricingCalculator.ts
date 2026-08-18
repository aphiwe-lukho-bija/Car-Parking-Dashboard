interface ParkingFeeInput {
  checkInTime: Date;
  checkOutTime: Date;
  gracePeriodMinutes: number;
  hourlyRate: number;
  dailyMaximum: number;
}

// ok so this is the core function doing all the actual math for the parking costs.
// took me a bit to get my head around how dates work in js, but basically getTime() 
// gives timestamps in milliseconds so subtracting them gives the total duration.
export function calculateParkingFee({
  checkInTime,
  checkOutTime,
  gracePeriodMinutes,
  hourlyRate,
  dailyMaximum,
}: ParkingFeeInput): number {
  // convert the dates to milliseconds and find the difference between them
  const durationMilliseconds =
    checkOutTime.getTime() - checkInTime.getTime();

  // convert ms to total minutes (1000ms in sec, 60sec in min)
  const durationMinutes = durationMilliseconds / (1000 * 60);

  // validation check here: if someone tries to checkout before checkin, time is negative,
  // so throw an error instead of calculating negative fees or breaking the logic
  if (durationMinutes < 0) {
    throw new Error("Check-out time cannot be before check-in time.");
  }

  // grace period check: if total stay was less than or equal to grace period,
  // then parking is completely free (returns 0 early)
  if (durationMinutes <= gracePeriodMinutes) {
    return 0;
  }

  // Math.ceil rounds UP to the next full hour because if someone stays for 1 hr and 5 mins,
  // they still get charged for 2 full hours (started hour rule)
  const hoursCharged = Math.ceil(durationMinutes / 60);

  // multiply full hours by the hourly rate to get calculated fee
  const calculatedFee = hoursCharged * hourlyRate;

  // Math.min checks calculated fee vs daily maximum and picks whichever is smaller,
  // so if calculated fee is R120 but daily max is R100, it returns R100
  return Math.min(calculatedFee, dailyMaximum);
}