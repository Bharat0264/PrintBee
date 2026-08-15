import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";

export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const range = params.get("range");
  const now = new Date();
  let from: Date;
  let to = now;
  if (range === "1d") from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  else if (range === "30d") from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  else {
    const fromValue = params.get("from");
    const toValue = params.get("to");
    if (!fromValue || !toValue) return NextResponse.json({ error: "Choose both custom dates" }, { status: 400 });
    from = new Date(`${fromValue}T00:00:00.000`);
    to = new Date(`${toValue}T23:59:59.999`);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }
  const rows = await database().prepare(`SELECT order_number, customer_name, customer_email, mobile_number, location_name, items_json, printing_subtotal_paise, delivery_fee_paise, platform_fee_paise, packaging_fee_paise, payment_gateway_fee_paise, surge_fee_paise, late_night_fee_paise, points_discount_paise, total_paise, payment_status, payment_reference, status, rider_email, created_at FROM orders WHERE hidden_at IS NULL AND payment_status='PAID' AND created_at BETWEEN ? AND ? ORDER BY created_at DESC`).bind(from.toISOString(), to.toISOString()).all();
  return NextResponse.json({ from: from.toISOString(), to: to.toISOString(), orders: rows.results });
}
