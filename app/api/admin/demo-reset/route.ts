import { NextResponse } from "next/server";
import { database, fileBucket } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function POST() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const db = database();
  const [uploads, paymentQrs, orderCount] = await Promise.all([
    db.prepare("SELECT storage_key FROM uploads WHERE order_id IS NOT NULL AND deleted_at IS NULL").all<{ storage_key: string }>(),
    db.prepare("SELECT payment_qr_storage_key storage_key FROM orders WHERE payment_qr_storage_key IS NOT NULL").all<{ storage_key: string }>(),
    db.prepare("SELECT COUNT(*) count FROM orders").first<{ count: number }>(),
  ]);
  const keys = [...uploads.results, ...paymentQrs.results].map((row) => row.storage_key).filter(Boolean);
  await Promise.all(keys.map((key) => fileBucket().delete(key)));
  await db.batch([
    db.prepare("DELETE FROM uploads WHERE order_id IS NOT NULL"),
    db.prepare("DELETE FROM orders"),
    db.prepare("UPDATE order_sequences SET next_value=1 WHERE id='orders'"),
  ]);
  return NextResponse.json({ deletedOrders: orderCount?.count ?? 0, deletedFiles: keys.length, revenuePaise: 0 });
}
