import { NextResponse } from "next/server";
import { database } from "../db";
import { getViewer } from "../../supabase/server";

export async function GET() {
  const rows = await database().prepare("SELECT id, name, description, active, is_binding, price_paise FROM print_services WHERE active=1 ORDER BY created_at, name").all();
  return NextResponse.json(rows.results);
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const body = await request.json() as { name?: string; description?: string; isBinding?: boolean; price?: number };
  const name = body.name?.trim();
  if (!name || name.length > 60) return NextResponse.json({ error: "Enter a service name up to 60 characters" }, { status: 400 });
  const pricePaise = Math.round(Number(body.price) * 100);
  if (!Number.isFinite(pricePaise) || pricePaise < 0) return NextResponse.json({ error: "Enter a valid service price" }, { status: 400 });
  const id = crypto.randomUUID();
  await database().prepare("INSERT INTO print_services (id,name,description,active,is_binding,price_paise,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(id, name, body.description?.trim().slice(0, 125) ?? "", 1, body.isBinding ? 1 : 0, pricePaise, new Date().toISOString()).run();
  return NextResponse.json({ id, name, price_paise: pricePaise });
}

export async function DELETE(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await request.json() as { id?: string };
  if (!id) return NextResponse.json({ error: "Service is required" }, { status: 400 });
  await database().prepare("UPDATE print_services SET active=0 WHERE id=?").bind(id).run();
  return NextResponse.json({ ok: true });
}
