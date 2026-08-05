import { NextResponse } from "next/server";
import { database, fileBucket } from "../../db";
import { getViewer } from "../../../supabase/server";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_CHUNK_BYTES = 700 * 1024;
const MAX_CHUNKS = Math.ceil(MAX_UPLOAD_BYTES / MAX_CHUNK_BYTES);

function validFileName(name: string) {
  return /\.(pdf|heic|jpe?g|png|webp)$/i.test(name);
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function chunkKey(email: string, sessionId: string, index: number) {
  return `pending/${email}/${sessionId}/${String(index).padStart(3, "0")}`;
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
    if (!validFileName(fileName)) return NextResponse.json({ error: "Upload only PDF, JPEG, PNG, or HEIC files." }, { status: 400 });
    if (!Number.isInteger(fileSize) || fileSize < 1 || fileSize > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "The maximum upload size is 50 MB." }, { status: 413 });
    if (!Number.isInteger(pageCount) || pageCount < 1) return NextResponse.json({ error: "The document page count could not be verified" }, { status: 400 });
    return NextResponse.json({ sessionId: crypto.randomUUID(), chunkSize: MAX_CHUNK_BYTES });
  }

  if (action === "part") {
    const sessionId = url.searchParams.get("sessionId") ?? "";
    const index = Number(url.searchParams.get("index"));
    if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !Number.isInteger(index) || index < 0 || index >= MAX_CHUNKS) return NextResponse.json({ error: "Invalid upload part" }, { status: 400 });
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_CHUNK_BYTES) return NextResponse.json({ error: "Invalid upload part size" }, { status: 400 });
    await fileBucket().put(chunkKey(viewer.email, sessionId, index), bytes);
    return NextResponse.json({ uploaded: true, index });
  }

  if (action === "complete") {
    const body = await request.json() as { sessionId?: string; fileName?: string; fileSize?: number; pageCount?: number; contentType?: string; chunkCount?: number };
    const sessionId = body.sessionId ?? "";
    const fileName = body.fileName?.trim() ?? "";
    const fileSize = Math.round(Number(body.fileSize));
    const pageCount = Math.round(Number(body.pageCount));
    const chunkCount = Math.round(Number(body.chunkCount));
    if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !validFileName(fileName) || !Number.isInteger(fileSize) || fileSize < 1 || fileSize > MAX_UPLOAD_BYTES || !Number.isInteger(pageCount) || pageCount < 1 || !Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > MAX_CHUNKS) return NextResponse.json({ error: "Invalid upload details" }, { status: 400 });

    const partKeys = Array.from({ length: chunkCount }, (_, index) => chunkKey(viewer.email, sessionId, index));
    const objects = await Promise.all(partKeys.map((key) => fileBucket().get(key)));
    if (objects.some((object) => !object)) return NextResponse.json({ error: "One or more upload parts are missing. Please try again." }, { status: 400 });
    const buffers = await Promise.all(objects.map((object) => object!.arrayBuffer()));
    const actualSize = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
    if (actualSize !== fileSize) return NextResponse.json({ error: "The uploaded file was incomplete. Please try again." }, { status: 400 });

    const id = crypto.randomUUID();
    const key = `customers/${viewer.email}/${id}/${safeName(fileName)}`;
    const contentType = body.contentType || (fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
    await fileBucket().put(key, new Blob(buffers, { type: contentType }), { httpMetadata: { contentType } });
    await database().prepare("INSERT INTO uploads (id, customer_email, original_name, content_type, storage_key, size_bytes, page_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, viewer.email, fileName, contentType, key, fileSize, pageCount, new Date().toISOString()).run();
    await Promise.all(partKeys.map((partKey) => fileBucket().delete(partKey)));
    return NextResponse.json({ uploadId: id });
  }

  return NextResponse.json({ error: "Invalid upload action" }, { status: 400 });
}
