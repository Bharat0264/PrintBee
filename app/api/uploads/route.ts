import { NextResponse } from "next/server";
import { database, fileBucket } from "../db";
import { getViewer } from "../../supabase/server";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function isPrintableFile(file: File) {
  return file.type === "application/pdf" || file.type.startsWith("image/") || /\.(avif|bmp|gif|heic|heif|jpe?g|png|tiff?|webp)$/i.test(file.name);
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in before uploading" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const pageCount = Number(form.get("pageCount"));
  if (!(file instanceof File) || !isPrintableFile(file) || file.size > MAX_UPLOAD_BYTES || !Number.isInteger(pageCount) || pageCount < 1) {
    return NextResponse.json({ error: "Upload a PDF or image up to 50 MB" }, { status: 400 });
  }
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `customers/${viewer.email}/${id}/${safeName}`;
  const contentType = file.type || "application/octet-stream";
  await fileBucket().put(key, file.stream(), { httpMetadata: { contentType } });
  await database().prepare("INSERT INTO uploads (id, customer_email, original_name, content_type, storage_key, size_bytes, page_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, viewer.email, file.name, contentType, key, file.size, pageCount, new Date().toISOString()).run();
  return NextResponse.json({ uploadId: id });
}
