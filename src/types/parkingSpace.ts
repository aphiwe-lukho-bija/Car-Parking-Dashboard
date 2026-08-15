export interface ParkingSpace {
  id: number;
  spaceNumber: string;
  type: "car" | "SUV" | "truck" | "motorbike";
  isAvailable: boolean;
}