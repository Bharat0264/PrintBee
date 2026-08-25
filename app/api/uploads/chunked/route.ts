import { NextResponse } from "next/server";
import { mongoDb } from "../../../../lib/mongodb";
import { r2 } from "../../../../lib/r2";
import { getViewer } from "../../../supabase/server";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_CHUNK_BYTES = 5 * 1024 * 1024;
const MAX_CHUNKS = Math.ceil(MAX_UPLOAD_BYTES / MAX_CHUNK_BYTES);

function validFileName(name: string) {
  return /\.(pdf|heic|jpe?g|png|webp)$/i.test(name);
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
    const multipart = await r2.createMultipartUpload(storageKey(viewer.email, uploadId, fileName), contentType);
    if (!multipart.UploadId) return NextResponse.json({ error: "Could not start the upload" }, { status: 502 });
    return NextResponse.json({ sessionId: multipart.UploadId, uploadId, chunkSize: MAX_CHUNK_BYTES });
  }

  if (action === "part") {
    const sessionId = url.searchParams.get("sessionId") ?? "";
    const uploadId = url.searchParams.get("uploadId") ?? "";
    const fileName = url.searchParams.get("fileName")?.trim() ?? "";
    const index = Number(url.searchParams.get("index"));
    if (!sessionId || sessionId.length > 1024 || !/^[0-9a-f-]{36}$/i.test(uploadId) || !validFileName(fileName) || !Number.isInteger(index) || index < 0 || index >= MAX_CHUNKS) return NextResponse.json({ error: "Invalid upload part" }, { status: 400 });
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_CHUNK_BYTES) return NextResponse.json({ error: "Invalid upload part size" }, { status: 400 });
    const uploadedPart = await r2.uploadPart(storageKey(viewer.email, uploadId, fileName), sessionId, index + 1, new Uint8Array(bytes));
    if (!uploadedPart.ETag) return NextResponse.json({ error: "Could not save upload part" }, { status: 502 });
    return NextResponse.json({ uploaded: true, partNumber: index + 1, etag: uploadedPart.ETag });
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
    const object = await r2.completeMultipartUpload(key, sessionId, parts);
    const stored = await r2.head(key);
    if (Number(stored.ContentLength) !== fileSize) {
      await r2.delete(key);
      return NextResponse.json({ error: "The uploaded file was incomplete. Please try again." }, { status: 400 });
    }
    await mongoDb().collection("uploads").insertOne({ id: uploadId, customer_email: viewer.email, original_name: fileName, content_type: contentType, storage_key: key, size_bytes: fileSize, page_count: pageCount, created_at: new Date().toISOString() });
    return NextResponse.json({ uploadId });
  }

  return NextResponse.json({ error: "Invalid upload action" }, { status: 400 });
}
