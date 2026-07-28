import { NextResponse } from "next/server";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const db = database();
  const [summary, orders, revenueOrders, activeUsers, riders, riderApplications, locations, locationStats, files, riderPayments, riderWithdrawals] = await Promise.all([
    db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status='DELIVERED' THEN 1 ELSE 0 END) delivered, SUM(CASE WHEN payment_status='PAID' THEN 1 ELSE 0 END) paid, SUM(CASE WHEN payment_status='PENDING' THEN 1 ELSE 0 END) unpaid, SUM(CASE WHEN payment_status='PAID' THEN total_paise ELSE 0 END) revenue_paise, SUM(CASE WHEN status='READY_FOR_PICKUP' THEN 1 ELSE 0 END) ready FROM orders`).first(),
    db.prepare(`SELECT id, order_number, customer_email, customer_name, mobile_number, location_name, items_json, printing_subtotal_paise, delivery_fee_paise, platform_fee_paise, total_paise, payment_status, payment_reference, payment_rejection_reason, payment_verified_at, status, rider_email, cancellation_reason, cancelled_at, cancelled_by, delivered_at, created_at FROM orders ORDER BY created_at DESC LIMIT 100`).all(),
    db.prepare(`SELECT o.order_number, o.total_paise revenue_paise, o.printing_subtotal_paise, o.delivery_fee_paise, o.platform_fee_paise, o.rider_email, COALESCE(u.name, o.rider_email, 'Not assigned') rider_name, CAST(o.delivery_fee_paise * 3 / 4 AS INTEGER) rider_fee_paise, o.printing_subtotal_paise + o.platform_fee_paise + CAST(o.delivery_fee_paise / 5 AS INTEGER) admin_revenue_paise, o.created_at FROM orders o LEFT JOIN app_users u ON u.email=o.rider_email WHERE o.payment_status='PAID' ORDER BY o.created_at DESC LIMIT 100`).all(),
    db.prepare(`SELECT customer_email email, MAX(customer_name) name, MAX(mobile_number) mobile_number, COUNT(*) order_count, SUM(CASE WHEN payment_status='PAID' THEN total_paise ELSE 0 END) paid_spend_paise, MAX(created_at) last_order_at FROM orders GROUP BY customer_email ORDER BY last_order_at DESC LIMIT 100`).all(),
    db.prepare(`SELECT u.email, u.name, u.mobile_number, COUNT(DISTINCT o.id) assigned, SUM(CASE WHEN o.status='DELIVERED' THEN 1 ELSE 0 END) delivered, COALESCE(SUM(CASE WHEN o.status='DELIVERED' THEN CAST(o.delivery_fee_paise * 3 / 4 AS INTEGER) ELSE 0 END), 0) earned_paise, COALESCE((SELECT SUM(rw.amount_paise) FROM rider_withdrawals rw WHERE rw.rider_email=u.email), 0) withdrawn_paise FROM app_users u LEFT JOIN orders o ON o.rider_email=u.email WHERE u.role='AGENT' AND u.approval_status='APPROVED' GROUP BY u.email ORDER BY delivered DESC`).all(),
    db.prepare("SELECT email, name, mobile_number, created_at FROM app_users WHERE role='AGENT' AND approval_status='PENDING' ORDER BY created_at").all(),
    db.prepare("SELECT id, name, active, delivery_fee_paise, platform_fee_paise FROM locations ORDER BY name").all(),
    db.prepare(`SELECT l.id, l.name, l.active, l.delivery_fee_paise, l.platform_fee_paise, COUNT(o.id) orders, SUM(CASE WHEN o.status='DELIVERED' THEN 1 ELSE 0 END) delivered, COALESCE(SUM(CASE WHEN o.payment_status='PAID' THEN o.total_paise ELSE 0 END), 0) revenue_paise FROM locations l LEFT JOIN orders o ON o.location_id=l.id GROUP BY l.id, l.name, l.active ORDER BY revenue_paise DESC, l.name`).all(),
    db.prepare("SELECT id, order_id, original_name, deleted_at FROM uploads WHERE order_id IS NOT NULL ORDER BY created_at").all(),
    db.prepare("SELECT id, rider_email, amount_paise, payment_date, note, recorded_by, created_at FROM rider_payments ORDER BY payment_date DESC, created_at DESC LIMIT 100").all(),
    db.prepare("SELECT id, rider_email, upi_id, amount_paise, status, requested_at, updated_at, updated_by FROM rider_withdrawals ORDER BY requested_at DESC LIMIT 100").all(),
  ]);
  const filesByOrder = new Map<string, unknown[]>();
  for (const file of files.results as Array<{ id: string; order_id: string; original_name: string; deleted_at: string | null }>) {
    const current = filesByOrder.get(file.order_id) ?? [];
    current.push(file);
    filesByOrder.set(file.order_id, current);
  }
  return NextResponse.json({
    summary,
    revenueOrders: revenueOrders.results,
    activeUsers: activeUsers.results,
    orders: (orders.results as Array<{ id: string; items_json: string }>).map((order) => {
      let items: unknown[] = [];
      try {
        const parsed = JSON.parse(order.items_json);
        if (Array.isArray(parsed)) items = parsed;
      } catch {}
      return { ...order, items, files: filesByOrder.get(order.id) ?? [] };
    }),
    riders: riders.results,
    riderApplications: riderApplications.results,
    locations: locations.results,
    locationStats: locationStats.results,
    riderPayments: riderPayments.results,
    riderWithdrawals: riderWithdrawals.results,
  });
}
