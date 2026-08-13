import { NextResponse } from "next/server";
import { database, fileBucket } from "../../db";
import { getViewer } from "../../../supabase/server";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_CHUNK_BYTES = 5 * 1024 * 1024;
const MAX_CHUNKS = Math.ceil(MAX_UPLOAD_BYTES / MAX_CHUNK_BYTES);

function validFileName(name: string) {
  return /\.pdf$/i.test(name);
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function storageKey(email: string, uploadId: string, fileName: string) {
  return `customers/${email}/${uploadId}/${safeName(fileName)}`;
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in before uploading" }, { status: 401 });
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "init") {
    const body = await request.json() as { fileName?: string; fileSize?: number; pageCount?: number; contentType?: string };
    const fileName = body.fileName?.trim() ?? "";
    const fileSize = Math.round(Number(body.fileSize));
    const pageCount = Math.round(Number(body.pageCount));
    if (!validFileName(fileName)) return NextResponse.json({ error: "This file type cannot be printed. Upload a document, spreadsheet, presentation, text file, or image." }, { status: 400 });
    if (!Number.isInteger(fileSize) || fileSize < 1 || fileSize > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "The maximum upload size is 50 MB." }, { status: 413 });
    if (!Number.isInteger(pageCount) || pageCount < 1) return NextResponse.json({ error: "The document page count could not be verified" }, { status: 400 });
    const uploadId = crypto.randomUUID();
    const contentType = body.contentType || (fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
    const multipart = await fileBucket().createMultipartUpload(storageKey(viewer.email, uploadId, fileName), { httpMetadata: { contentType } });
    return NextResponse.json({ sessionId: multipart.uploadId, uploadId, chunkSize: MAX_CHUNK_BYTES });
  }

  if (action === "part") {
    const sessionId = url.searchParams.get("sessionId") ?? "";
    const uploadId = url.searchParams.get("uploadId") ?? "";
    const fileName = url.searchParams.get("fileName")?.trim() ?? "";
    const index = Number(url.searchParams.get("index"));
    if (!sessionId || sessionId.length > 1024 || !/^[0-9a-f-]{36}$/i.test(uploadId) || !validFileName(fileName) || !Number.isInteger(index) || index < 0 || index >= MAX_CHUNKS) return NextResponse.json({ error: "Invalid upload part" }, { status: 400 });
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_CHUNK_BYTES) return NextResponse.json({ error: "Invalid upload part size" }, { status: 400 });
    const multipart = fileBucket().resumeMultipartUpload(storageKey(viewer.email, uploadId, fileName), sessionId);
    const uploadedPart = await multipart.uploadPart(index + 1, bytes);
    return NextResponse.json({ uploaded: true, partNumber: uploadedPart.partNumber, etag: uploadedPart.etag });
  }

  if (action === "complete") {
    const body = await request.json() as { sessionId?: string; uploadId?: string; fileName?: string; fileSize?: number; pageCount?: number; contentType?: string; parts?: Array<{ partNumber: number; etag: string }> };
    const sessionId = body.sessionId ?? "";
    const uploadId = body.uploadId ?? "";
    const fileName = body.fileName?.trim() ?? "";
    const fileSize = Math.round(Number(body.fileSize));
    const pageCount = Math.round(Number(body.pageCount));
    const parts = body.parts ?? [];
    if (!sessionId || sessionId.length > 1024 || !/^[0-9a-f-]{36}$/i.test(uploadId) || !validFileName(fileName) || !Number.isInteger(fileSize) || fileSize < 1 || fileSize > MAX_UPLOAD_BYTES || !Number.isInteger(pageCount) || pageCount < 1 || !parts.length || parts.length > MAX_CHUNKS || parts.some((part, index) => part.partNumber !== index + 1 || !part.etag)) return NextResponse.json({ error: "Invalid upload details" }, { status: 400 });

    const key = storageKey(viewer.email, uploadId, fileName);
    const contentType = body.contentType || (fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
    const multipart = fileBucket().resumeMultipartUpload(key, sessionId);
    const object = await multipart.complete(parts);
    if (object.size !== fileSize) {
      await fileBucket().delete(key);
      return NextResponse.json({ error: "The uploaded file was incomplete. Please try again." }, { status: 400 });
    }
    await database().prepare("INSERT INTO uploads (id, customer_email, original_name, content_type, storage_key, size_bytes, page_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(uploadId, viewer.email, fileName, contentType, key, fileSize, pageCount, new Date().toISOString()).run();
    return NextResponse.json({ uploadId });
  }

  return NextResponse.json({ error: "Invalid upload action" }, { status: 400 });
}
