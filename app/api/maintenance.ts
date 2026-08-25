import { mongoDb } from "../../lib/mongodb";

export async function cleanupAbandonedCheckouts() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return mongoDb().collection("orders").deleteMany({ payment_status: "PENDING", status: "PAYMENT_PENDING", created_at: { $lt: cutoff } });
}
