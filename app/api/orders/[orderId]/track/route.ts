import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";
import { ensureTrackingTables, haversineMeters } from "../../../delivery/tracking";

export async function GET(_: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const viewer = await getViewer(); if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  await ensureTrackingTables(); const { orderId } = await params, db = database();
  const order = await db.prepare("SELECT o.id,o.order_number,o.customer_email,o.status,o.payment_status,o.delivery_latitude,o.delivery_longitude,o.rider_email,u.name rider_name,u.mobile_number rider_mobile_number,l.latitude rider_latitude,l.longitude rider_longitude,l.accuracy,l.updated_at FROM orders o LEFT JOIN app_users u ON u.email=o.rider_email LEFT JOIN current_rider_locations l ON l.order_id=o.id WHERE o.id=?").bind(orderId).first<any>();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const assignedRider = order.rider_email === viewer.email;
  if (!viewer.isAdmin && !assignedRider && order.customer_email !== viewer.email) return NextResponse.json({ error: "Order access denied" }, { status: 403 });
  const active = ["PICKED_UP", "OUT_FOR_DELIVERY", "RIDER_NEARBY"].includes(order.status);
  const canSeeLocation = active && (viewer.isAdmin || assignedRider || order.customer_email === viewer.email) && Number.isFinite(order.rider_latitude);
  const distanceMeters = canSeeLocation ? Math.round(haversineMeters(Number(order.rider_latitude), Number(order.rider_longitude), Number(order.delivery_latitude), Number(order.delivery_longitude))) : null;
  const etaMinutes = distanceMeters == null ? null : Math.max(2, Math.ceil(distanceMeters / 250));
  const history = await db.prepare("SELECT previous_status,new_status,actor_type,created_at FROM order_status_history WHERE order_id=? ORDER BY created_at").bind(orderId).all<any>();
  return NextResponse.json({ order: { id: order.id, orderNumber: order.order_number, status: order.status, rider: order.rider_name ? { name: order.rider_name, mobile: order.rider_mobile_number } : null, destination: { latitude: order.delivery_latitude, longitude: order.delivery_longitude }, location: canSeeLocation ? { latitude: order.rider_latitude, longitude: order.rider_longitude, accuracy: order.accuracy, updatedAt: order.updated_at } : null, distanceMeters, etaMinutes, history: history.results } });
}
