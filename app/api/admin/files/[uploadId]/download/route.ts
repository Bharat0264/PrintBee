import { NextResponse } from "next/server";
import { database, fileBucket } from "../../../../db";
import { getViewer } from "../../../../../supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ uploadId: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { uploadId } = await context.params;
  const file = await database().prepare("SELECT original_name, content_type, storage_key FROM uploads WHERE id=? AND order_id IS NOT NULL").bind(uploadId).first<{ original_name: string; content_type: string; storage_key: string }>();
  if (!file) return NextResponse.json({ error: "Order file not found" }, { status: 404 });
  const object = await fileBucket().get(file.storage_key);
  if (!object) return NextResponse.json({ error: "Stored file is unavailable" }, { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": file.content_type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`, "Cache-Control": "private, no-store" } });
}
