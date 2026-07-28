import { NextResponse } from "next/server";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const db = database();
  const [summary, orders, riders, locations, locationStats, files, riderPayments] = await Promise.all([
    db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status='DELIVERED' THEN 1 ELSE 0 END) delivered, SUM(CASE WHEN payment_status='PAID' THEN 1 ELSE 0 END) paid, SUM(CASE WHEN payment_status='PENDING' THEN 1 ELSE 0 END) unpaid, SUM(CASE WHEN payment_status='PAID' THEN total_paise ELSE 0 END) revenue_paise, SUM(CASE WHEN status='READY_FOR_PICKUP' THEN 1 ELSE 0 END) ready FROM orders`).first(),
    db.prepare(`SELECT id, order_number, customer_email, customer_name, mobile_number, location_name, items_json, printing_subtotal_paise, delivery_fee_paise, platform_fee_paise, total_paise, payment_status, payment_reference, status, rider_email, cancellation_reason, cancelled_at, cancelled_by, created_at FROM orders ORDER BY created_at DESC LIMIT 100`).all(),
    db.prepare(`SELECT u.email, COUNT(DISTINCT o.id) assigned, SUM(CASE WHEN o.status='DELIVERED' THEN 1 ELSE 0 END) delivered, COALESCE((SELECT SUM(rp.amount_paise) FROM rider_payments rp WHERE rp.rider_email=u.email), 0) income_paise, COALESCE((SELECT SUM(rp.amount_paise) FROM rider_payments rp WHERE rp.rider_email=u.email AND rp.payment_date=date('now')), 0) paid_today_paise FROM app_users u LEFT JOIN orders o ON o.rider_email=u.email WHERE u.role='AGENT' GROUP BY u.email ORDER BY delivered DESC`).all(),
    db.prepare("SELECT id, name, active FROM locations ORDER BY name").all(),
    db.prepare(`SELECT l.id, l.name, l.active, COUNT(o.id) orders, SUM(CASE WHEN o.status='DELIVERED' THEN 1 ELSE 0 END) delivered, COALESCE(SUM(CASE WHEN o.payment_status='PAID' THEN o.total_paise ELSE 0 END), 0) revenue_paise FROM locations l LEFT JOIN orders o ON o.location_id=l.id GROUP BY l.id, l.name, l.active ORDER BY revenue_paise DESC, l.name`).all(),
    db.prepare("SELECT id, order_id, original_name FROM uploads WHERE order_id IS NOT NULL ORDER BY created_at").all(),
    db.prepare("SELECT id, rider_email, amount_paise, payment_date, note, recorded_by, created_at FROM rider_payments ORDER BY payment_date DESC, created_at DESC LIMIT 100").all(),
  ]);
  const filesByOrder = new Map<string, unknown[]>();
  for (const file of files.results as Array<{ id: string; order_id: string; original_name: string }>) {
    const current = filesByOrder.get(file.order_id) ?? [];
    current.push(file);
    filesByOrder.set(file.order_id, current);
  }
  return NextResponse.json({
    summary,
    orders: (orders.results as Array<{ id: string; items_json: string }>).map((order) => {
      let items: unknown[] = [];
      try {
        const parsed = JSON.parse(order.items_json);
        if (Array.isArray(parsed)) items = parsed;
      } catch {}
      return { ...order, items, files: filesByOrder.get(order.id) ?? [] };
    }),
    riders: riders.results,
    locations: locations.results,
    locationStats: locationStats.results,
    riderPayments: riderPayments.results,
  });
}
