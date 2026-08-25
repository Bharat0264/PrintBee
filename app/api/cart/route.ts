import { NextResponse } from "next/server";
import { mongoDb } from "../../../lib/mongodb";
import { r2 } from "../../../lib/r2";
import { getViewer } from "../../supabase/server";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json([]);
  const db = mongoDb();
  const items = await db.collection<{ upload_id: string; item_json: string; created_at: string }>("cart_items").find({ customer_email: viewer.email }).sort({ created_at: 1 }).toArray();
  const uploadIds = items.filter((item) => !item.upload_id.startsWith("addon:")).map((item) => item.upload_id);
  const uploads = new Set((await db.collection<{ id: string }>("uploads").find({ id: { $in: uploadIds }, customer_email: viewer.email, order_id: { $exists: false }, deleted_at: { $exists: false } }, { projection: { id: 1 } }).toArray()).map((upload) => upload.id));
  return NextResponse.json(items.flatMap((item) => {
    if (!item.upload_id.startsWith("addon:") && !uploads.has(item.upload_id)) return [];
    try { return [JSON.parse(item.item_json)]; } catch { return []; }
  }));
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const item = await request.json() as any;
  if (!item.id || !item.uploadId) return NextResponse.json({ error: "Invalid cart item" }, { status: 400 });
  if (item.kind === "ADDON") {
    const addon = await mongoDb().collection<{ id: string; name: string; description: string; price_paise: number }>("addons").findOne({ id: item.addonId, active: { $in: [true, 1] } });
    if (!addon || item.uploadId !== `addon:${addon.id}`) return NextResponse.json({ error: "This add-on is unavailable" }, { status: 400 });
    const price = addon.price_paise / 100;
    Object.assign(item, { fileName: addon.name, total: price, addonsTotal: price, addons: [{ id: addon.id, name: addon.name, description: addon.description, price }] });
  }
  const itemJson = JSON.stringify(item);
  if (itemJson.length > 20_000) return NextResponse.json({ error: "Invalid cart item" }, { status: 400 });
  if (item.kind !== "ADDON") {
    const upload = await mongoDb().collection("uploads").findOne({ id: item.uploadId, customer_email: viewer.email, order_id: { $exists: false }, deleted_at: { $exists: false } }, { projection: { id: 1 } });
    if (!upload) return NextResponse.json({ error: "The uploaded file is unavailable" }, { status: 400 });
  }
  await mongoDb().collection("cart_items").updateOne({ upload_id: item.uploadId }, { $set: { id: item.id, customer_email: viewer.email, upload_id: item.uploadId, item_json: itemJson, created_at: new Date().toISOString() } }, { upsert: true });
  return NextResponse.json({ saved: true });
}

export async function DELETE(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const uploadId = new URL(request.url).searchParams.get("uploadId") ?? "";
  if (uploadId.startsWith("addon:")) {
    await mongoDb().collection("cart_items").deleteOne({ upload_id: uploadId, customer_email: viewer.email });
    return NextResponse.json({ removed: true });
  }
  const upload = await mongoDb().collection<{ storage_key: string }>("uploads").findOne({ id: uploadId, customer_email: viewer.email, order_id: { $exists: false } }, { projection: { storage_key: 1 } });
  if (!upload) return NextResponse.json({ removed: true });
  await r2.delete(upload.storage_key);
  const db = mongoDb();
  await Promise.all([
    db.collection("cart_items").deleteOne({ upload_id: uploadId, customer_email: viewer.email }),
    db.collection("uploads").deleteOne({ id: uploadId, customer_email: viewer.email, order_id: { $exists: false } }),
  ]);
  return NextResponse.json({ removed: true });
}
