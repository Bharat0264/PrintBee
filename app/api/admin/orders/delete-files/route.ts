import { NextResponse } from "next/server";
import { database, fileBucket } from "../../../db";
import { getViewer } from "../../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { orderId } = await request.json() as { orderId?: string };
  if (!orderId) return NextResponse.json({ error: "Order is required" }, { status: 400 });

  const db = database();
  const order = await db.prepare("SELECT status, delivered_at, cancelled_at FROM orders WHERE id=?").bind(orderId).first<{ status: string; delivered_at: string | null; cancelled_at: string | null }>();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const terminal = ["DELIVERED", "CANCELLED"].includes(order.status?.toUpperCase()) || Boolean(order.delivered_at) || Boolean(order.cancelled_at);
  if (!terminal) {
    return NextResponse.json({ error: "Documents can be deleted only after delivery or cancellation" }, { status: 400 });
  }

  const result = await db.prepare("SELECT id, storage_key FROM uploads WHERE order_id=? AND deleted_at IS NULL").bind(orderId).all<{ id: string; storage_key: string }>();
  const files = result.results;
  if (!files.length) return NextResponse.json({ error: "Documents were already deleted or none were stored" }, { status: 400 });

  await Promise.all(files.map((file) => fileBucket().delete(file.storage_key)));
  const deletedAt = new Date().toISOString();
  await db.batch(files.map((file) => db.prepare("UPDATE uploads SET deleted_at=? WHERE id=?").bind(deletedAt, file.id)));
  return NextResponse.json({ deleted: files.length, deletedAt });
}
