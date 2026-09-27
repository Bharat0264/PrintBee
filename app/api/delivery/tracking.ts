import { database } from "../db";

export const DELIVERY_STATUSES = ["CONFIRMED", "PRINTING", "READY_FOR_PICKUP", "RIDER_ASSIGNED", "RIDER_ARRIVING_FOR_PICKUP", "PICKED_UP", "OUT_FOR_DELIVERY", "RIDER_NEARBY", "DELIVERED", "CANCELLED"] as const;
export type DeliveryStatus = typeof DELIVERY_STATUSES[number];

const transitions: Record<string, readonly string[]> = {
  CONFIRMED: ["PRINTING", "READY_FOR_PICKUP", "CANCELLED"], PRINTING: ["READY_FOR_PICKUP", "CANCELLED"],
  READY_FOR_PICKUP: ["RIDER_ASSIGNED", "CANCELLED"], RIDER_ASSIGNED: ["RIDER_ARRIVING_FOR_PICKUP", "PICKED_UP", "CANCELLED"],
  RIDER_ARRIVING_FOR_PICKUP: ["PICKED_UP", "CANCELLED"], PICKED_UP: ["OUT_FOR_DELIVERY", "RIDER_NEARBY"],
  // OTP verification is valid once a rider starts delivery. Location sharing
  // may be unavailable, so it must not be required to reach DELIVERED.
  OUT_FOR_DELIVERY: ["RIDER_NEARBY", "DELIVERED"], RIDER_NEARBY: ["DELIVERED"], DELIVERED: [], CANCELLED: [],
};

export function canTransition(from: string, to: string, override = false) { return override || Boolean(transitions[from]?.includes(to)); }
export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = 6371000, p = Math.PI / 180, dLat = (bLat - aLat) * p, dLng = (bLng - aLng) * p;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(x));
}

/** Idempotent rollout guard for D1 deployments; schema remains in drizzle migration too. */
let trackingSetup: Promise<void> | undefined;
export async function ensureTrackingTables() {
  if (trackingSetup) return trackingSetup;
  const db = database();
  trackingSetup = db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS order_status_history (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, previous_status TEXT, new_status TEXT NOT NULL, changed_by TEXT NOT NULL, actor_type TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS current_rider_locations (order_id TEXT PRIMARY KEY, rider_email TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL, accuracy REAL, updated_at TEXT NOT NULL)"),
  ]).then(() => undefined).catch((error) => { trackingSetup = undefined; throw error; });
  return trackingSetup;
}

export async function transitionOrder(orderId: string, previous: string, next: string, actorEmail: string, actorType: "ADMIN" | "RIDER", override = false) {
  if (!canTransition(previous, next, override)) return false;
  const db = database(), now = new Date().toISOString();
  const result = await db.prepare("UPDATE orders SET status=? WHERE id=? AND status=? AND payment_status='PAID'").bind(next, orderId, previous).run();
  if (!result.meta.changes) return false;
  await db.prepare("INSERT INTO order_status_history (id,order_id,previous_status,new_status,changed_by,actor_type,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(), orderId, previous, next, actorEmail, actorType, now).run();
  if (["DELIVERED", "CANCELLED"].includes(next)) await db.prepare("DELETE FROM current_rider_locations WHERE order_id=?").bind(orderId).run();
  return true;
}
