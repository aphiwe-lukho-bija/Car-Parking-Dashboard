export interface Vehicle {
  id: number;
  numberPlate: string;
  type: "car" | "SUV" | "truck" | "motorbike";
  userId: number;
}