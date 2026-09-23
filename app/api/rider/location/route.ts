import { NextResponse } from "next/server";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";
import { ensureTrackingTables, haversineMeters, transitionOrder } from "../../delivery/tracking";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { orderId, latitude, longitude, accuracy } = await request.json() as any;
  if (!orderId || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return NextResponse.json({ error: "Invalid location" }, { status: 400 });
  await ensureTrackingTables();
  const db = database();
  const order = await db.prepare("SELECT status,delivery_latitude,delivery_longitude FROM orders WHERE id=? AND rider_email=? AND payment_status='PAID'").bind(orderId, viewer.email).first<any>();
  if (!order) return NextResponse.json({ error: "Assigned order not found" }, { status: 404 });
  if (!["PICKED_UP", "OUT_FOR_DELIVERY", "RIDER_NEARBY"].includes(order.status)) return NextResponse.json({ error: "Location sharing starts after pickup" }, { status: 409 });
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO current_rider_locations (order_id,rider_email,latitude,longitude,accuracy,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET rider_email=excluded.rider_email,latitude=excluded.latitude,longitude=excluded.longitude,accuracy=excluded.accuracy,updated_at=excluded.updated_at").bind(orderId, viewer.email, latitude, longitude, Math.max(0, Number(accuracy) || 0), now).run();
  const distanceMeters = haversineMeters(latitude, longitude, Number(order.delivery_latitude), Number(order.delivery_longitude));
  if (order.status === "OUT_FOR_DELIVERY" && distanceMeters <= 250) await transitionOrder(orderId, "OUT_FOR_DELIVERY", "RIDER_NEARBY", viewer.email, "RIDER");
  return NextResponse.json({ updated: true, distanceMeters: Math.round(distanceMeters) });
}
