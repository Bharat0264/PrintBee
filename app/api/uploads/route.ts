import { NextResponse } from "next/server";
import { database, fileBucket } from "../db";
import { getViewer } from "../../supabase/server";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function isPrintableFile(file: File) {
  return /\.(pdf|heic|jpe?g|png|webp|gif|bmp|tiff?|docx?|pptx?|xlsx?|odt|ods|odp|rtf|txt|csv)$/i.test(file.name);
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in before uploading" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const pageCount = Number(form.get("pageCount"));
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a PDF or image to upload" }, { status: 400 });
  if (!isPrintableFile(file)) return NextResponse.json({ error: "This file type cannot be printed. Upload a document, spreadsheet, presentation, text file, or image." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: `This file is ${(file.size / 1024 / 1024).toFixed(2)} MB. The maximum upload size is 50 MB.` }, { status: 413 });
  if (!Number.isInteger(pageCount) || pageCount < 1) return NextResponse.json({ error: "The document page count could not be verified" }, { status: 400 });
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `customers/${viewer.email}/${id}/${safeName}`;
  const contentType = file.type || "application/octet-stream";
  await fileBucket().put(key, file.stream(), { httpMetadata: { contentType } });
  await database().prepare("INSERT INTO uploads (id, customer_email, original_name, content_type, storage_key, size_bytes, page_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, viewer.email, file.name, contentType, key, file.size, pageCount, new Date().toISOString()).run();
  return NextResponse.json({ uploadId: id });
}
