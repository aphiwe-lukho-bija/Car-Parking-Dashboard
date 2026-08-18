import { calculateParkingFee } from "../src/utils/pricingCalculator";

// ok so i need to make sure i rememeber how this test script feeds data into the calculator function.
// basically im setting up a mock checkin and checkout time here (like someone parked for 2 hours and 30 mins).
const checkInTime = new Date("2026-08-15T10:00:00");
const checkOutTime = new Date("2026-08-15T12:30:00");

// defynig the rules here so i dont get confused later: 10 mins free grace period, 
// R15 charged for every hour, and a max cap of R100 so people dont get overcharged if they stay all day
const gracePeriodMinutes = 10;
const hourlyRate = 15;
const dailyMaximum = 100;

try {
  // wrapping this in a try catch because if the dates are messed up or something throws an error, 
  // the script wont just crash completely in the terminal. passing everything as an object property.
  const parkingFee = calculateParkingFee({
    checkInTime,
    checkOutTime,
    gracePeriodMinutes,
    hourlyRate,
    dailyMaximum,
  });

  // printing out everything nicely so i can visually check if the math matches what i expect in my head
  console.log("=== Mall Parking Fee Calculator ===");
  console.log(`Check-in time: ${checkInTime.toLocaleTimeString()}`);
  console.log(`Check-out time: ${checkOutTime.toLocaleTimeString()}`);
  console.log(`Grace period: ${gracePeriodMinutes} minutes`);
  console.log(`Hourly rate: R${hourlyRate}`);
  console.log(`Daily maximum: R${dailyMaximum}`);
  console.log("-----------------------------------");
  console.log(`Parking fee: R${parkingFee}`);
} catch (error) {
  // if something goes wrong inside the calc function, catch it here so i see the error msg instead of a blank screen
  console.error("Error calculating parking fee.");
}