import { NextResponse } from "next/server";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";
import { readCoordinates } from "../../delivery/fees";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  return NextResponse.json(await database().prepare("SELECT latitude,longitude,accuracy,updated_at FROM store_location WHERE id='main'").first() ?? { configured: false });
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const point = readCoordinates(body);
  const accuracy = typeof body?.accuracy === "number" && Number.isFinite(body.accuracy) && body.accuracy >= 0 ? body.accuracy : null;
  if (!point) return NextResponse.json({ error: "Valid store coordinates are required" }, { status: 400 });
  const updatedAt = new Date().toISOString();
  await database().prepare("INSERT INTO store_location (id,latitude,longitude,accuracy,updated_at,updated_by) VALUES ('main',?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,accuracy=excluded.accuracy,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(point.latitude, point.longitude, accuracy, updatedAt, viewer.email).run();
  return NextResponse.json({ ...point, accuracy, updatedAt });
}
