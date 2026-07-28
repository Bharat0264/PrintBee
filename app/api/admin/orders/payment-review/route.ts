import { NextResponse } from "next/server";
import { database, fileBucket } from "../../../db";
import { getViewer } from "../../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { orderId, decision, missing } = await request.json() as { orderId?: string; decision?: "APPROVE" | "REJECT"; missing?: "REFERENCE" | "AMOUNT" | "BOTH" };
  const db = database();
  if (decision === "APPROVE") {
    const order = await db.prepare("SELECT payment_qr_storage_key FROM orders WHERE id=? AND (payment_reference IS NOT NULL OR payment_status='PAY_ON_DELIVERY') AND status!='CANCELLED'")
      .bind(orderId)
      .first<{ payment_qr_storage_key: string | null }>();
    if (!order) return NextResponse.json({ error: "This payment cannot be approved" }, { status: 400 });
    const verifiedAt = new Date().toISOString();
    const result = await db.prepare("UPDATE orders SET payment_status='PAID', payment_rejection_reason=NULL, payment_verified_at=?, payment_verified_by=?, payment_qr_storage_key=NULL, payment_qr_file_name=NULL, payment_qr_deleted_at=? WHERE id=? AND status!='CANCELLED'")
      .bind(verifiedAt, viewer.email, verifiedAt, orderId)
      .run();
    if (!result.meta.changes) return NextResponse.json({ error: "This payment cannot be approved" }, { status: 400 });
    if (order.payment_qr_storage_key) {
      try { await fileBucket().delete(order.payment_qr_storage_key); } catch {}
    }
    return NextResponse.json({ approved: true, scannerDeleted: Boolean(order.payment_qr_storage_key), verifiedAt });
  }
  const reasons = {
    REFERENCE: "Payment rejected: payment ID / UTR does not match.",
    AMOUNT: "Payment rejected: payment amount does not match the order total.",
    BOTH: "Payment rejected: both the payment ID / UTR and amount do not match.",
  };
  const reason = missing ? reasons[missing] : null;
  if (!reason) return NextResponse.json({ error: "Choose what did not match" }, { status: 400 });
  const result = await db.prepare("UPDATE orders SET payment_status='REJECTED', status='PAYMENT_REJECTED', payment_rejection_reason=?, payment_verified_at=?, payment_verified_by=?, rider_email=NULL WHERE id=? AND status NOT IN ('CANCELLED','DELIVERED')").bind(reason, new Date().toISOString(), viewer.email, orderId).run();
  if (!result.meta.changes) return NextResponse.json({ error: "Order cannot be reviewed" }, { status: 400 });
  return NextResponse.json({ rejected: true, reason });
}
