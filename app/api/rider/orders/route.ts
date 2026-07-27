import { NextResponse } from "next/server";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!viewer.isAdmin) {
    const agent = await database().prepare("SELECT role FROM app_users WHERE email=? AND role='AGENT'").bind(viewer.email).first();
    if (!agent) return NextResponse.json({ error: "Rider access required" }, { status: 403 });
  }
  const query = viewer.isAdmin
    ? database().prepare("SELECT order_number, customer_name, mobile_number, location_name, total_paise, status, rider_email FROM orders WHERE rider_email IS NOT NULL AND status!='DELIVERED' ORDER BY created_at")
    : database().prepare("SELECT order_number, customer_name, mobile_number, location_name, total_paise, status, rider_email FROM orders WHERE rider_email=? AND status!='DELIVERED' ORDER BY created_at").bind(viewer.email);
  const rows = await query.all();
  return NextResponse.json(rows.results);
}
