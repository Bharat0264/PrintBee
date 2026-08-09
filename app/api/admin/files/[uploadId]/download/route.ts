import { NextResponse } from "next/server";
import { database, fileBucket } from "../../../../db";
import { getViewer } from "../../../../../supabase/server";

function alphabeticSuffix(index: number) {
  let suffix = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    suffix = String.fromCharCode(97 + ((value - 1) % 26)) + suffix;
  }
  return suffix;
}

function fileExtension(fileName: string) {
  const match = fileName.match(/(\.[a-z0-9]{1,10})$/i);
  return match?.[1].toLowerCase() ?? "";
}

export async function GET(_request: Request, context: { params: Promise<{ uploadId: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { uploadId } = await context.params;
  const db = database();
  const file = await db.prepare("SELECT u.original_name, u.content_type, u.storage_key, u.deleted_at, u.order_id, o.order_number FROM uploads u JOIN orders o ON o.id=u.order_id WHERE u.id=?")
    .bind(uploadId)
    .first<{ original_name: string; content_type: string; storage_key: string; deleted_at: string | null; order_id: string; order_number: string }>();
  if (!file) return NextResponse.json({ error: "Order file not found" }, { status: 404 });
  if (file.deleted_at) return NextResponse.json({ error: "Document was deleted after order completion" }, { status: 410 });
  const object = await fileBucket().get(file.storage_key);
  if (!object) return NextResponse.json({ error: "Stored file is unavailable" }, { status: 404 });
  const orderFiles = await db.prepare("SELECT id FROM uploads WHERE order_id=? ORDER BY created_at, id").bind(file.order_id).all<{ id: string }>();
  const fileIndex = orderFiles.results.findIndex((orderFile) => orderFile.id === uploadId);
  if (fileIndex < 0) return NextResponse.json({ error: "Order file not found" }, { status: 404 });
  const suffix = orderFiles.results.length > 1 ? `-${alphabeticSuffix(fileIndex)}` : "";
  const downloadName = `${file.order_number}${suffix}${fileExtension(file.original_name)}`;
  return new Response(object.body, { headers: { "Content-Type": file.content_type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`, "Cache-Control": "private, no-store" } });
}
