import { NextResponse } from "next/server";
import { database, fileBucket } from "../../../db";
import { getViewer } from "../../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin || !["OWNER", "OPERATIONS"].includes(viewer.adminRole || "")) return NextResponse.json({ error: "Operations access required" }, { status: 403 });
  const { orderId } = await request.json() as { orderId?: string };
  const db = database();
  const order = await db.prepare("SELECT payment_qr_storage_key FROM orders WHERE id=? AND payment_status='PENDING' AND payment_reference IS NOT NULL AND status!='CANCELLED'")
    .bind(orderId)
    .first<{ payment_qr_storage_key: string | null }>();
  if (!order) return NextResponse.json({ error: "Customer payment reference is required" }, { status: 400 });
  const verifiedAt = new Date().toISOString();
  const result = await db.prepare("UPDATE orders SET payment_status='PAID', status='CONFIRMED', payment_verified_at=?, payment_verified_by=?, payment_qr_storage_key=NULL, payment_qr_file_name=NULL, payment_qr_deleted_at=? WHERE id=?")
    .bind(verifiedAt, viewer.email, verifiedAt, orderId)
    .run();
  if (!result.meta.changes) return NextResponse.json({ error: "Customer payment reference is required" }, { status: 400 });
  if (order.payment_qr_storage_key) {
    try { await fileBucket().delete(order.payment_qr_storage_key); } catch {}
  }
  return NextResponse.json({ paid: true, scannerDeleted: Boolean(order.payment_qr_storage_key), verifiedAt });
}
