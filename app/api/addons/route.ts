import { NextResponse } from "next/server";
import { database } from "../db";
import { getViewer } from "../../supabase/server";

export async function GET() {
  const rows = await database().prepare("SELECT id,name,description,price_paise,active FROM addons WHERE active=1 ORDER BY created_at,name").all();
  return NextResponse.json(rows.results, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const body = await request.json() as { id?: string; name?: string; description?: string; price?: number };
  const name = body.name?.trim();
  const pricePaise = Math.round(Number(body.price) * 100);
  if (!name || name.length > 60) return NextResponse.json({ error: "Enter an add-on name up to 60 characters" }, { status: 400 });
  if (!Number.isFinite(pricePaise) || pricePaise < 0) return NextResponse.json({ error: "Enter a valid add-on price" }, { status: 400 });
  const id = body.id || crypto.randomUUID();
  const now = new Date().toISOString();
  await database().prepare("INSERT INTO addons (id,name,description,price_paise,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,price_paise=excluded.price_paise,active=1,updated_at=excluded.updated_at")
    .bind(id, name, body.description?.trim().slice(0, 125) ?? "", pricePaise, now, now).run();
  return NextResponse.json({ id, name, description: body.description?.trim().slice(0, 125) ?? "", price_paise: pricePaise, active: 1 });
}

export async function DELETE(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await request.json() as { id?: string };
  if (!id) return NextResponse.json({ error: "Add-on is required" }, { status: 400 });
  await database().prepare("UPDATE addons SET active=0,updated_at=? WHERE id=?").bind(new Date().toISOString(), id).run();
  return NextResponse.json({ ok: true });
}
