import { NextResponse } from "next/server";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";
import { readCoordinates } from "../../delivery/fees";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  return NextResponse.json(await database().prepare("SELECT name,latitude,longitude,accuracy,updated_at FROM store_location WHERE id='main'").first() ?? { configured: false });
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (name && !readCoordinates(body)) {
    if (name.length > 80) return NextResponse.json({ error: "Store name must be 80 characters or fewer" }, { status: 400 });
    const existing = await database().prepare("SELECT latitude,longitude,accuracy,updated_at FROM store_location WHERE id='main'").first<any>();
    if (!existing) return NextResponse.json({ error: "Set the current store location before naming it" }, { status: 400 });
    const updatedAt = new Date().toISOString();
    await database().prepare("UPDATE store_location SET name=?,updated_at=?,updated_by=? WHERE id='main'").bind(name, updatedAt, viewer.email).run();
    return NextResponse.json({ ...existing, name, updatedAt });
  }
  const point = readCoordinates(body);
  const accuracy = typeof body?.accuracy === "number" && Number.isFinite(body.accuracy) && body.accuracy >= 0 ? body.accuracy : null;
  if (!point) return NextResponse.json({ error: "Valid store coordinates are required" }, { status: 400 });
  const updatedAt = new Date().toISOString();
  await database().prepare("INSERT INTO store_location (id,name,latitude,longitude,accuracy,updated_at,updated_by) VALUES ('main',?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,accuracy=excluded.accuracy,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(name || null, point.latitude, point.longitude, accuracy, updatedAt, viewer.email).run();
  const current = await database().prepare("SELECT name FROM store_location WHERE id='main'").first<{ name: string | null }>();
  return NextResponse.json({ ...point, name: current?.name ?? null, accuracy, updatedAt });
}
