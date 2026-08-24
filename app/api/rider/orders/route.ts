import { NextResponse } from "next/server";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!viewer.isAdmin) {
    const agent = await database().prepare("SELECT role FROM app_users WHERE email=? AND role='AGENT' AND approval_status='APPROVED'").bind(viewer.email).first();
    if (!agent) return NextResponse.json({ error: "Rider access required" }, { status: 403 });
  }
  const query = viewer.isAdmin
    ? database().prepare("SELECT id, order_number, customer_name, mobile_number, location_name, incampus_delivery, incampus_type, campus_building, classroom_number, delivery_latitude, delivery_longitude, total_paise, payment_status, status, rider_email, payment_qr_storage_key IS NOT NULL has_payment_qr, created_at FROM orders WHERE rider_email IS NOT NULL AND status!='DELIVERED' ORDER BY created_at")
    : database().prepare("SELECT id, order_number, customer_name, mobile_number, location_name, incampus_delivery, incampus_type, campus_building, classroom_number, delivery_latitude, delivery_longitude, total_paise, payment_status, status, rider_email, payment_qr_storage_key IS NOT NULL has_payment_qr, created_at FROM orders WHERE rider_email=? AND status!='DELIVERED' ORDER BY created_at").bind(viewer.email);
  const rows = await query.all();
  return NextResponse.json(rows.results);
}
