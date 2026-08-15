import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin || !["OWNER", "OPERATIONS"].includes(viewer.adminRole || "")) return NextResponse.json({ error: "Operations access required" }, { status: 403 });
  const { orderId, points } = await request.json() as { orderId?: string; points?: number };
  const cleanPoints = Math.round(Number(points));
  if (!orderId || !Number.isInteger(cleanPoints) || cleanPoints < 1 || cleanPoints > 10000) return NextResponse.json({ error: "Enter between 1 and 10,000 points" }, { status: 400 });
  const db = database();
  const order = await db.prepare("SELECT customer_email,order_number FROM orders WHERE id=?").bind(orderId).first<{ customer_email: string; order_number: string }>();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const profile = await db.prepare("SELECT email FROM customer_profiles WHERE email=?").bind(order.customer_email).first();
  if (!profile) return NextResponse.json({ error: "Customer wallet is not available yet" }, { status: 409 });
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE customer_profiles SET points_balance=points_balance+? WHERE email=?").bind(cleanPoints, order.customer_email),
    db.prepare("INSERT INTO wallet_transactions (id,email,points,kind,description,order_id,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(), order.customer_email, cleanPoints, "ADMIN_CREDIT", `${cleanPoints} points credited by PrintBee for order ${order.order_number}`, orderId, now),
  ]);
  return NextResponse.json({ credited: true, points: cleanPoints });
}
