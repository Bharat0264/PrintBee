import { NextResponse } from "next/server";
import { database } from "../../db";
import { franchiseAccess } from "../access";

export async function GET() {
  const access = await franchiseAccess();
  if (!access.viewer?.isAdmin) return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  const rows = await database().prepare("SELECT * FROM franchise_applications ORDER BY created_at DESC LIMIT 200").all();
  return NextResponse.json(rows.results);
}

export async function POST(request: Request) {
  const access = await franchiseAccess();
  if (!access.viewer?.isAdmin) return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const status = String(body?.status ?? "");
  if (!body?.id || !["SUBMITTED", "REVIEWING", "APPROVED", "REJECTED"].includes(status)) return NextResponse.json({ error: "Invalid application update" }, { status: 400 });
  await database().prepare("UPDATE franchise_applications SET status=?,updated_at=? WHERE id=?").bind(status, new Date().toISOString(), body.id).run();
  return NextResponse.json({ updated: true });
}
