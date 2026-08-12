import { NextResponse } from "next/server";
import { database, fileBucket, hashDeliveryCode } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!viewer.isAdmin) {
    const agent = await database().prepare("SELECT role FROM app_users WHERE email = ? AND role = 'AGENT' AND approval_status='APPROVED'").bind(viewer.email).first();
    if (!agent) return NextResponse.json({ error: "Delivery-agent access required" }, { status: 403 });
  }
  const { orderNumber, code } = await request.json() as { orderNumber?: string; code?: string };
  const db = database();
  const order = await db.prepare("SELECT id, order_number, customer_email, total_paise, delivery_code_hash, status, payment_status, rider_email, payment_qr_storage_key FROM orders WHERE order_number = ?").bind(orderNumber?.trim().toUpperCase()).first<{ id: string; order_number: string; customer_email: string; total_paise: number; delivery_code_hash: string; status: string; payment_status: string; rider_email: string | null; payment_qr_storage_key: string | null }>();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status === "DELIVERED") return NextResponse.json({ error: "Order is already delivered" }, { status: 409 });
  if (order.status !== "RIDER_ASSIGNED") return NextResponse.json({ error: "Order must be assigned to a rider before delivery" }, { status: 400 });
  if (order.payment_status !== "PAID") return NextResponse.json({ error: "Payment must be verified before delivery" }, { status: 400 });
  if (!viewer.isAdmin && order.rider_email !== viewer.email) return NextResponse.json({ error: "This order is assigned to another rider" }, { status: 403 });
  const candidate = await hashDeliveryCode(order.id, code?.trim() ?? "");
  if (candidate !== order.delivery_code_hash) return NextResponse.json({ error: "Delivery code does not match" }, { status: 400 });
  const uploads = await db.prepare("SELECT storage_key FROM uploads WHERE order_id=?").bind(order.id).all<{ storage_key: string }>();
  const storageKeys = uploads.results.map((file) => file.storage_key);
  if (order.payment_qr_storage_key) storageKeys.push(order.payment_qr_storage_key);
  await Promise.all(storageKeys.map((storageKey) => fileBucket().delete(storageKey)));
  const now = new Date().toISOString();
  const spendPoints = Math.floor(order.total_paise / 1000);
  const [updated] = await db.batch([
    db.prepare("UPDATE orders SET status='DELIVERED', delivered_at=?, delivered_by=?, spend_points_awarded=?, payment_qr_storage_key=NULL, payment_qr_file_name=NULL, payment_qr_deleted_at=? WHERE id=? AND status='RIDER_ASSIGNED'").bind(now, viewer.email, spendPoints, now, order.id),
    ...(spendPoints > 0 ? [
      db.prepare("UPDATE customer_profiles SET points_balance=points_balance+? WHERE email=?").bind(spendPoints, order.customer_email),
      db.prepare("INSERT INTO wallet_transactions (id,email,points,kind,description,order_id,created_at) VALUES (?,?,?,?,?,?,?)").bind(`spend-${order.id}`, order.customer_email, spendPoints, "DELIVERY_SPEND_REWARD", `${spendPoints} points earned after delivery of order ${order.order_number}`, order.id, now),
    ] : []),
    db.prepare("DELETE FROM uploads WHERE order_id=? AND EXISTS (SELECT 1 FROM orders WHERE id=? AND status='DELIVERED' AND delivered_at=?)").bind(order.id, order.id, now),
  ]);
  if (!updated.meta.changes) return NextResponse.json({ error: "Order delivery status changed; refresh and try again" }, { status: 409 });
  return NextResponse.json({ delivered: true, documentsDeleted: uploads.results.length, spendPoints });
}
