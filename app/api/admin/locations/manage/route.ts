import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin || !["OWNER", "OPERATIONS"].includes(viewer.adminRole || "")) return NextResponse.json({ error: "Operations access required" }, { status: 403 });
  const { locationId, action, name } = await request.json() as { locationId?: string; action?: "RENAME" | "DELETE"; name?: string };
  if (!locationId || !action) return NextResponse.json({ error: "Location and action are required" }, { status: 400 });
  const db = database();
  if (action === "RENAME") {
    const cleanName = name?.trim();
    if (!cleanName || cleanName.length > 80) return NextResponse.json({ error: "Enter a valid location name" }, { status: 400 });
    const result = await db.prepare("UPDATE locations SET name=? WHERE id=? AND active=1").bind(cleanName, locationId).run();
    if (!result.meta.changes) return NextResponse.json({ error: "Active location not found" }, { status: 404 });
    return NextResponse.json({ renamed: true, name: cleanName });
  }
  if (action === "DELETE") {
    const result = await db.prepare("UPDATE locations SET active=0 WHERE id=? AND active=1").bind(locationId).run();
    if (!result.meta.changes) return NextResponse.json({ error: "Active location not found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
