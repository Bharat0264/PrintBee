import { NextResponse } from "next/server";
import { database, fileBucket } from "../../../db";
import { getViewer } from "../../../../supabase/server";

async function ensureColumn() {
  for (const statement of [
    "ALTER TABLE addons ADD COLUMN image_storage_key TEXT",
    "ALTER TABLE addons ADD COLUMN image_data BLOB",
    "ALTER TABLE addons ADD COLUMN image_content_type TEXT",
  ]) {
    try { await database().prepare(statement).run(); } catch { /* already exists */ }
  }
}

export async function GET(_: Request, { params }: { params: Promise<{ addonId: string }> }) {
  await ensureColumn(); const { addonId } = await params;
  const addon = await database().prepare("SELECT image_storage_key,image_data,image_content_type FROM addons WHERE id=? AND active=1").bind(addonId).first<{ image_storage_key: string | null; image_data: ArrayBuffer | null; image_content_type: string | null }>();
  if (addon?.image_data) return new Response(new Uint8Array(addon.image_data), { headers: { "Content-Type": addon.image_content_type || "image/jpeg", "Cache-Control": "public, max-age=3600" } });
  if (!addon?.image_storage_key) return NextResponse.json({ error: "Image not found" }, { status: 404 });
  try {
    const object = await fileBucket().get(addon.image_storage_key);
    if (!object) return NextResponse.json({ error: "Image not found" }, { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "public, max-age=3600" } });
  } catch { return NextResponse.json({ error: "Image not found" }, { status: 404 }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ addonId: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin || !["OWNER", "OPERATIONS"].includes(viewer.adminRole || "")) return NextResponse.json({ error: "Operations access required" }, { status: 403 });
  await ensureColumn(); const { addonId } = await params, form = await request.formData(), file = form.get("image");
  if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Upload a JPG, PNG, WebP, or GIF image up to 5 MB" }, { status: 400 });
  const addon = await database().prepare("SELECT image_storage_key FROM addons WHERE id=?").bind(addonId).first<{ image_storage_key: string | null }>();
  if (!addon) return NextResponse.json({ error: "Add-on not found" }, { status: 404 });
  const imageData = await file.arrayBuffer();
  await database().prepare("UPDATE addons SET image_data=?,image_content_type=?,updated_at=? WHERE id=?").bind(imageData, file.type, new Date().toISOString(), addonId).run();
  // Remove a legacy R2 object only when the binding is available. It is not
  // part of the upload path, so a missing binding can no longer block admins.
  if (addon.image_storage_key) { try { await fileBucket().delete(addon.image_storage_key); } catch {} }
  return NextResponse.json({ image_url: `/api/addons/${addonId}/image` });
}
