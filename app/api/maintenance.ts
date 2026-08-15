import { database } from "./db";

export async function cleanupAbandonedCheckouts() {
  return database().prepare("DELETE FROM orders WHERE payment_status='PENDING' AND status='PAYMENT_PENDING' AND created_at<datetime('now','-24 hours')").run();
}
