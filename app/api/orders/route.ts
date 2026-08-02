import { NextResponse } from "next/server";
import { database, encryptDeliveryCode, hashDeliveryCode } from "../db";
import { getViewer } from "../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await request.json() as { customerName?: string; mobileNumber?: string; locationId?: string; items?: unknown[]; totalPaise?: number };
  const name = body.customerName?.trim();
  const mobile = body.mobileNumber?.replace(/\D/g, "");
  if (!name || !mobile || mobile.length !== 10 || !body.locationId || !body.items?.length) {
    return NextResponse.json({ error: "Name, 10-digit mobile, location and cart items are required" }, { status: 400 });
  }
  const location = await database().prepare("SELECT id, name, delivery_fee_paise, platform_fee_paise FROM locations WHERE id = ? AND active = 1").bind(body.locationId).first<{ id: string; name: string; delivery_fee_paise: number; platform_fee_paise: number }>();
  if (!location) return NextResponse.json({ error: "Choose an available delivery location" }, { status: 400 });
  const id = crypto.randomUUID();
  const code = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  const deliveryCode = code.toString().padStart(6, "0");
  const printingSubtotalPaise = Math.max(0, Math.round(Number(body.totalPaise) || 0));
  const deliveryFeePaise = location.delivery_fee_paise ?? 1500;
  const platformFeePaise = location.platform_fee_paise ?? 350;
  const uploadIds = body.items.map((item: any) => item.uploadId).filter(Boolean);
  if (uploadIds.length !== body.items.length) return NextResponse.json({ error: "Every cart item must finish uploading" }, { status: 400 });
  let totalPrintedPages = 0;
  for (const item of body.items as Array<{ uploadId?: string; copies?: number; serviceId?: string }>) {
    const upload = await database().prepare("SELECT id, page_count FROM uploads WHERE id=? AND customer_email=? AND order_id IS NULL").bind(item.uploadId, viewer.email).first<{ id: string; page_count: number }>();
    if (!upload) return NextResponse.json({ error: "One or more uploaded files are unavailable" }, { status: 400 });
    const service = await database().prepare("SELECT counts_for_packaging FROM print_services WHERE id=? AND active=1").bind(item.serviceId || "document-printing").first<{ counts_for_packaging: number }>();
    if (!service) return NextResponse.json({ error: "One or more selected services are unavailable" }, { status: 400 });
    if (service.counts_for_packaging) totalPrintedPages += upload.page_count * Math.max(1, Math.min(100, Math.round(Number(item.copies) || 1)));
  }
  const packagingRule = await database().prepare("SELECT charge_paise FROM packaging_charge_rules WHERE min_pages<=? AND max_pages>=? ORDER BY min_pages DESC LIMIT 1").bind(totalPrintedPages, totalPrintedPages).first<{ charge_paise: number }>();
  const packagingFeePaise = packagingRule?.charge_paise ?? 0;
  const totalPaise = printingSubtotalPaise + deliveryFeePaise + platformFeePaise + packagingFeePaise;
  const hash = await hashDeliveryCode(id, deliveryCode);
  const encryptedCode = await encryptDeliveryCode(deliveryCode);
  const db = database();
  const sequence = await db.prepare("UPDATE order_sequences SET next_value=next_value+1 WHERE id='orders' RETURNING next_value-1 number").first<{ number: number }>();
  if (!sequence) return NextResponse.json({ error: "Order numbering is temporarily unavailable" }, { status: 503 });
  const orderNumber = `PB${String(sequence.number).padStart(3, "0")}`;
  await db.prepare(`INSERT INTO orders (id, order_number, customer_email, customer_name, mobile_number, location_id, location_name, items_json, printing_subtotal_paise, delivery_fee_paise, platform_fee_paise, packaging_fee_paise, total_paise, delivery_code_hash, delivery_code_encrypted, status, payment_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAYMENT_PENDING', 'PENDING', ?)`)
    .bind(id, orderNumber, viewer.email, name, mobile, location.id, location.name, JSON.stringify(body.items), printingSubtotalPaise, deliveryFeePaise, platformFeePaise, packagingFeePaise, totalPaise, hash, encryptedCode, new Date().toISOString()).run();
  await db.batch(uploadIds.map((uploadId) => db.prepare("UPDATE uploads SET order_id=? WHERE id=?").bind(id, uploadId)));
  return NextResponse.json({ id, orderNumber, locationName: location.name, totalPaise, paymentMode: "RAZORPAY" });
}
