import { NextResponse } from "next/server";
import { database, fileBucket } from "../../../db";
import { getViewer } from "../../../../supabase/server";

async function ensureColumn() { try { await database().prepare("ALTER TABLE addons ADD COLUMN image_storage_key TEXT").run(); } catch {} }

export async function GET(_: Request, { params }: { params: Promise<{ addonId: string }> }) {
  await ensureColumn(); const { addonId } = await params;
  const addon = await database().prepare("SELECT image_storage_key FROM addons WHERE id=? AND active=1").bind(addonId).first<{ image_storage_key: string | null }>();
  if (!addon?.image_storage_key) return NextResponse.json({ error: "Image not found" }, { status: 404 });
  const object = await fileBucket().get(addon.image_storage_key);
  if (!object) return NextResponse.json({ error: "Image not found" }, { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "public, max-age=3600" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ addonId: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin || !["OWNER", "OPERATIONS"].includes(viewer.adminRole || "")) return NextResponse.json({ error: "Operations access required" }, { status: 403 });
  await ensureColumn(); const { addonId } = await params, form = await request.formData(), file = form.get("image");
  if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Upload a JPG, PNG, WebP, or GIF image up to 5 MB" }, { status: 400 });
  const addon = await database().prepare("SELECT image_storage_key FROM addons WHERE id=?").bind(addonId).first<{ image_storage_key: string | null }>();
  if (!addon) return NextResponse.json({ error: "Add-on not found" }, { status: 404 });
  const key = `addons/${addonId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await fileBucket().put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await database().prepare("UPDATE addons SET image_storage_key=?,updated_at=? WHERE id=?").bind(key, new Date().toISOString(), addonId).run();
  if (addon.image_storage_key) await fileBucket().delete(addon.image_storage_key).catch(() => {});
  return NextResponse.json({ image_url: `/api/addons/${addonId}/image` });
}
