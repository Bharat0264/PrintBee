import { NextResponse } from "next/server";
import { database } from "../db";
import { getViewer } from "../../supabase/server";

export async function GET() {
  const rows = await database().prepare("SELECT id, name, delivery_fee_paise, platform_fee_paise FROM locations WHERE active = 1 ORDER BY name").all();
  return NextResponse.json(rows.results);
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { name } = await request.json() as { name?: string };
  const cleanName = name?.trim();
  if (!cleanName) return NextResponse.json({ error: "Location name is required" }, { status: 400 });
  const id = crypto.randomUUID();
  await database().prepare("INSERT INTO locations (id, name, active, created_at, delivery_fee_paise, platform_fee_paise) VALUES (?, ?, 1, ?, 1500, 350)").bind(id, cleanName, new Date().toISOString()).run();
  return NextResponse.json({ id, name: cleanName });
}
