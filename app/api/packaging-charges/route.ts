import { NextResponse } from "next/server";
import { database } from "../db";
import { getViewer } from "../../supabase/server";

export async function GET() {
  const rows = await database().prepare("SELECT id, min_pages, max_pages, charge_paise FROM packaging_charge_rules ORDER BY min_pages").all();
  return NextResponse.json(rows.results);
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const body = await request.json() as { id?: string; minPages?: number; maxPages?: number; charge?: number };
  const minPages = Math.round(Number(body.minPages));
  const maxPages = Math.round(Number(body.maxPages));
  const chargePaise = Math.round(Number(body.charge) * 100);
  if (!Number.isInteger(minPages) || !Number.isInteger(maxPages) || minPages < 1 || maxPages < minPages || !Number.isFinite(chargePaise) || chargePaise < 0) return NextResponse.json({ error: "Enter a valid page range and charge" }, { status: 400 });
  const overlap = await database().prepare("SELECT id FROM packaging_charge_rules WHERE id!=? AND min_pages<=? AND max_pages>=?").bind(body.id ?? "", maxPages, minPages).first();
  if (overlap) return NextResponse.json({ error: "This page range overlaps an existing range" }, { status: 409 });
  const id = body.id || crypto.randomUUID();
  const now = new Date().toISOString();
  await database().prepare("INSERT INTO packaging_charge_rules (id,min_pages,max_pages,charge_paise,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET min_pages=excluded.min_pages,max_pages=excluded.max_pages,charge_paise=excluded.charge_paise,updated_at=excluded.updated_at").bind(id, minPages, maxPages, chargePaise, now, now).run();
  return NextResponse.json({ id, min_pages: minPages, max_pages: maxPages, charge_paise: chargePaise });
}

export async function DELETE(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await request.json() as { id?: string };
  await database().prepare("DELETE FROM packaging_charge_rules WHERE id=?").bind(id).run();
  return NextResponse.json({ deleted: true });
}
