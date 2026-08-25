import { NextResponse } from "next/server";
import { hashDeliveryCode } from "../../db";
import { mongoDb } from "../../../../lib/mongodb";
import { r2 } from "../../../../lib/r2";
import { getViewer } from "../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!viewer.isAdmin) {
    const agent = await mongoDb().collection("app_users").findOne({ email: viewer.email, role: "AGENT", approval_status: "APPROVED" });
    if (!agent) return NextResponse.json({ error: "Delivery-agent access required" }, { status: 403 });
  }
  const { orderNumber, code } = await request.json() as { orderNumber?: string; code?: string };
  const db = mongoDb();
  const order = await db.collection<{ id: string; order_number: string; customer_email: string; total_paise: number; delivery_code_hash: string; status: string; payment_status: string; rider_email: string | null; payment_qr_storage_key: string | null }>("orders").findOne({ order_number: orderNumber?.trim().toUpperCase() });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status === "DELIVERED") return NextResponse.json({ error: "Order is already delivered" }, { status: 409 });
  if (order.status !== "RIDER_ASSIGNED") return NextResponse.json({ error: "Order must be assigned to a rider before delivery" }, { status: 400 });
  if (order.payment_status !== "PAID") return NextResponse.json({ error: "Payment must be verified before delivery" }, { status: 400 });
  if (!viewer.isAdmin && order.rider_email !== viewer.email) return NextResponse.json({ error: "This order is assigned to another rider" }, { status: 403 });
  const candidate = await hashDeliveryCode(order.id, code?.trim() ?? "");
  if (candidate !== order.delivery_code_hash) return NextResponse.json({ error: "Delivery code does not match" }, { status: 400 });
  const profile = await db.collection<{ referred_by_email?: string }>("customer_profiles").findOne({ email: order.customer_email }, { projection: { _id: 0, referred_by_email: 1 } });
  const uploads = await db.collection<{ storage_key: string }>("uploads").find({ order_id: order.id }, { projection: { _id: 0, storage_key: 1 } }).toArray();
  const storageKeys = uploads.map((file) => file.storage_key);
  if (order.payment_qr_storage_key) storageKeys.push(order.payment_qr_storage_key);
  await Promise.all(storageKeys.map((storageKey) => r2.delete(storageKey)));
  const now = new Date().toISOString();
  const spendPoints = Math.floor(order.total_paise / 1000);
  const referralPoints = profile?.referred_by_email ? Math.floor(order.total_paise / 1500) : 0;
  const updated = await db.collection("orders").updateOne({ id: order.id, status: "RIDER_ASSIGNED" }, { $set: { status: "DELIVERED", delivered_at: now, delivered_by: viewer.email, spend_points_awarded: spendPoints, referral_rewarded_at: referralPoints > 0 ? now : null, payment_qr_storage_key: null, payment_qr_file_name: null, payment_qr_deleted_at: now } });
  if (!updated.modifiedCount) return NextResponse.json({ error: "Order delivery status changed; refresh and try again" }, { status: 409 });
  await Promise.all([
    ...(spendPoints > 0 ? [db.collection("customer_profiles").updateOne({ email: order.customer_email }, { $inc: { points_balance: spendPoints } }), db.collection("wallet_transactions").insertOne({ id: `spend-${order.id}`, email: order.customer_email, points: spendPoints, kind: "DELIVERY_SPEND_REWARD", description: `${spendPoints} points earned after delivery of order ${order.order_number}`, order_id: order.id, created_at: now })] : []),
    ...(referralPoints > 0 && profile?.referred_by_email ? [db.collection("customer_profiles").updateOne({ email: profile.referred_by_email }, { $inc: { points_balance: referralPoints } }), db.collection("wallet_transactions").insertOne({ id: `referral-${order.id}`, email: profile.referred_by_email, points: referralPoints, kind: "REFERRAL_SPEND_REWARD", description: `${referralPoints} referral points earned after delivery of order ${order.order_number}`, order_id: order.id, created_at: now })] : []),
    db.collection("uploads").deleteMany({ order_id: order.id }),
  ]);
  return NextResponse.json({ delivered: true, documentsDeleted: uploads.length, spendPoints, referralPoints });
}
