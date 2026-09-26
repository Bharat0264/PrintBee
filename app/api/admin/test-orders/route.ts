import { NextResponse } from "next/server";
import { database, encryptDeliveryCode, fileBucket, hashDeliveryCode } from "../../db";
import { getViewer } from "../../../supabase/server";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const printable = (file: File) => /\.(pdf|heic|jpe?g|png|webp)$/i.test(file.name);

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin || !["OWNER", "OPERATIONS"].includes(viewer.adminRole || "")) return NextResponse.json({ error: "Operations access required" }, { status: 403 });
  const form = await request.formData(), file = form.get("file"), pages = Math.max(1, Math.floor(Number(form.get("pageCount")) || 1));
  const address = String(form.get("deliveryAddress") || "Admin test delivery").trim().slice(0, 500);
  if (!(file instanceof File) || !printable(file)) return NextResponse.json({ error: "Upload a PDF, JPG, PNG, WEBP, or HEIC file" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Test file must be 50 MB or smaller" }, { status: 413 });
  const db = database();
  try { await db.prepare("ALTER TABLE orders ADD COLUMN is_test_order INTEGER NOT NULL DEFAULT 0").run(); } catch { /* already migrated */ }
  const store = await db.prepare("SELECT latitude,longitude FROM store_location WHERE id='main'").first<{ latitude: number; longitude: number }>();
  if (!store) return NextResponse.json({ error: "Set the main store location before creating a delivery test" }, { status: 400 });
  const id = crypto.randomUUID(), uploadId = crypto.randomUUID(), now = new Date().toISOString();
  const deliveryCode = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `admin-tests/${viewer.email}/${id}/${safeName}`;
  await fileBucket().put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
  const item = { id: uploadId, uploadId, fileName: file.name, pages, copies: 1, mode: "bw-single", unitPrice: 0, bwUnitPrice: 0, colourUnitPrice: 0, total: 0, serviceId: "document-printing", serviceName: "Test printing", servicePrice: 0, kind: "TEST_PRINT" };
  const orderNumber = `TEST-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  await db.batch([
    db.prepare("INSERT INTO uploads (id,customer_email,original_name,content_type,storage_key,size_bytes,page_count,order_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(uploadId, viewer.email, file.name, file.type || "application/octet-stream", key, file.size, pages, id, now),
    db.prepare("INSERT INTO orders (id,order_number,customer_email,customer_name,mobile_number,location_id,location_name,items_json,printing_subtotal_paise,delivery_fee_paise,delivery_latitude,delivery_longitude,delivery_address,delivery_captured_at,store_latitude,store_longitude,platform_fee_paise,packaging_fee_paise,payment_gateway_fee_paise,surge_fee_paise,late_night_fee_paise,incampus_fee_paise,points_redeemed,points_discount_paise,total_paise,delivery_code_hash,delivery_code_encrypted,status,payment_status,is_test_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, orderNumber, viewer.email, "Admin test order", "0000000000", "ADMIN_TEST", address, JSON.stringify([item]), 0, 0, Number(store.latitude), Number(store.longitude), address, now, Number(store.latitude), Number(store.longitude), 0, 0, 0, 0, 0, 0, 0, 0, 0, await hashDeliveryCode(id, deliveryCode), await encryptDeliveryCode(deliveryCode), "CONFIRMED", "PAID", 1, now),
  ]);
  return NextResponse.json({ orderNumber, deliveryCode });
}
