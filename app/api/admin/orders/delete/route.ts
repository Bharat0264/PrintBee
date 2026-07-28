import { NextResponse } from "next/server";
import { database, fileBucket } from "../../../db";
import { getViewer } from "../../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { orderId } = await request.json() as { orderId?: string };
  if (!orderId) return NextResponse.json({ error: "Order is required" }, { status: 400 });

  const db = database();
  const order = await db.prepare("SELECT order_number, payment_qr_storage_key FROM orders WHERE id=?")
    .bind(orderId)
    .first<{ order_number: string; payment_qr_storage_key: string | null }>();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const uploads = await db.prepare("SELECT storage_key FROM uploads WHERE order_id=? AND deleted_at IS NULL")
    .bind(orderId)
    .all<{ storage_key: string }>();
  const keys = uploads.results.map((file) => file.storage_key).filter(Boolean);
  if (order.payment_qr_storage_key) keys.push(order.payment_qr_storage_key);
  await Promise.all(keys.map((key) => fileBucket().delete(key)));
  await db.batch([
    db.prepare("DELETE FROM uploads WHERE order_id=?").bind(orderId),
    db.prepare("DELETE FROM orders WHERE id=?").bind(orderId),
  ]);
  return NextResponse.json({ deleted: true, orderNumber: order.order_number, deletedFiles: keys.length });
}
