import { NextResponse } from "next/server";
import { database } from "../../db";
import { franchiseAccess, canOperateStore } from "../access";

export async function GET() {
  const access = await franchiseAccess();
  if (!access.viewer || (!access.viewer.isAdmin && !access.storeIds?.length)) return NextResponse.json({ error: "Franchise access required" }, { status: 403 });
  const db = database();
  const rows = access.viewer.isAdmin
    ? await db.prepare("SELECT id,order_number,franchise_store_id,franchise_store_name,customer_name,mobile_number,location_name,total_paise,status,payment_status,created_at FROM orders WHERE payment_status='PAID' AND franchise_store_id IS NOT NULL AND hidden_at IS NULL ORDER BY created_at DESC LIMIT 200").all()
    : await db.prepare("SELECT id,order_number,franchise_store_id,franchise_store_name,customer_name,mobile_number,location_name,total_paise,status,payment_status,created_at FROM orders WHERE payment_status='PAID' AND franchise_store_id IN (SELECT store_id FROM franchise_members WHERE lower(email)=?) AND hidden_at IS NULL ORDER BY created_at DESC LIMIT 200").bind(access.viewer.email.toLowerCase()).all();
  return NextResponse.json({ orders: rows.results });
}

export async function POST(request: Request) {
  const access = await franchiseAccess(); const body = await request.json() as { orderId?: string; status?: string };
  if (!access.viewer || !body.orderId || !["CONFIRMED","PRINTING","READY_FOR_PICKUP","RIDER_ASSIGNED","DELIVERED"].includes(String(body.status))) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const order = await database().prepare("SELECT franchise_store_id FROM orders WHERE id=? AND payment_status='PAID'").bind(body.orderId).first<{ franchise_store_id: string }>();
  if (!canOperateStore(access, order?.franchise_store_id)) return NextResponse.json({ error: "This order belongs to another store" }, { status: 403 });
  await database().prepare("UPDATE orders SET status=? WHERE id=? AND status NOT IN ('DELIVERED','CANCELLED')").bind(body.status, body.orderId).run();
  return NextResponse.json({ updated: true });
}
