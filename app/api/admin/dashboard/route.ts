import { NextResponse } from "next/server";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const db = database();
  const [summary, orders, riders, locations] = await Promise.all([
    db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status='DELIVERED' THEN 1 ELSE 0 END) delivered, SUM(CASE WHEN payment_status='PAID' THEN total_paise ELSE 0 END) revenue_paise, SUM(CASE WHEN status='READY_FOR_PICKUP' THEN 1 ELSE 0 END) ready FROM orders`).first(),
    db.prepare(`SELECT id, order_number, customer_name, location_name, total_paise, payment_status, status, rider_email, created_at FROM orders ORDER BY created_at DESC LIMIT 50`).all(),
    db.prepare(`SELECT u.email, COUNT(o.id) assigned, SUM(CASE WHEN o.status='DELIVERED' THEN 1 ELSE 0 END) delivered FROM app_users u LEFT JOIN orders o ON o.rider_email=u.email WHERE u.role='AGENT' GROUP BY u.email ORDER BY delivered DESC`).all(),
    db.prepare("SELECT id, name, active FROM locations ORDER BY name").all(),
  ]);
  return NextResponse.json({ summary, orders: orders.results, riders: riders.results, locations: locations.results });
}
