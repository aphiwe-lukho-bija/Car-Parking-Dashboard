export interface SimulatedPayment {
  id: number;
  parkingSessionId: number;
  amount: number;
  paymentMethod: "cash" | "card";
  status: "pending" | "paid" | "failed";
  paymentTime?: Date;
}