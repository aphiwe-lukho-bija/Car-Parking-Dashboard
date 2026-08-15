export interface ParkingSession {
  id: number;
  vehicleId: number;
  parkingSpaceId: number;
  checkInTime: Date;
  checkOutTime?: Date;
  fee?: number;
}