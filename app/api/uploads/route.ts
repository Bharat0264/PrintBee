import { NextResponse } from "next/server";
import { database, fileBucket } from "../db";
import { getViewer } from "../../supabase/server";

const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in before uploading" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const pageCount = Number(form.get("pageCount"));
  if (!(file instanceof File) || !allowed.has(file.type) || file.size > 25 * 1024 * 1024 || !Number.isInteger(pageCount) || pageCount < 1) {
    return NextResponse.json({ error: "Valid PDF/image up to 25 MB required" }, { status: 400 });
  }
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `customers/${viewer.email}/${id}/${safeName}`;
  await fileBucket().put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await database().prepare("INSERT INTO uploads (id, customer_email, original_name, content_type, storage_key, size_bytes, page_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, viewer.email, file.name, file.type, key, file.size, pageCount, new Date().toISOString()).run();
  return NextResponse.json({ uploadId: id });
}
