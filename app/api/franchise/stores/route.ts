import { NextResponse } from "next/server";
import { database } from "../../db";
import { franchiseAccess } from "../access";

export async function GET() {
  const access = await franchiseAccess();
  if (!access.viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const query = access.viewer.isAdmin ? "SELECT s.*, GROUP_CONCAT(m.email) members FROM franchise_stores s LEFT JOIN franchise_members m ON m.store_id=s.id GROUP BY s.id ORDER BY s.name" : "SELECT s.*, GROUP_CONCAT(m.email) members FROM franchise_stores s LEFT JOIN franchise_members m ON m.store_id=s.id WHERE s.id IN (SELECT store_id FROM franchise_members WHERE lower(email)=?) GROUP BY s.id ORDER BY s.name";
  const rows = access.viewer.isAdmin ? await database().prepare(query).all() : await database().prepare(query).bind(access.viewer.email.toLowerCase()).all();
  return NextResponse.json(rows.results);
}

export async function POST(request: Request) {
  const access = await franchiseAccess();
  if (!access.viewer?.isAdmin) return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  const body = await request.json() as any;
  const name = String(body.name ?? "").trim(); const address = String(body.address ?? "").trim(); const latitude = Number(body.latitude); const longitude = Number(body.longitude); const emails = Array.isArray(body.members) ? body.members.map((value: unknown) => String(value).trim().toLowerCase()).filter(Boolean) : [];
  if (!name || !address || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return NextResponse.json({ error: "Store name, address and map location are required" }, { status: 400 });
  const id = crypto.randomUUID(); const now = new Date().toISOString(); const db = database();
  await db.batch([db.prepare("INSERT INTO franchise_stores (id,name,address,latitude,longitude,radius_meters,active,created_at,updated_at) VALUES (?,?,?,?,?,5000,1,?,?)").bind(id,name,address,latitude,longitude,now,now), db.prepare("INSERT INTO franchise_settings (store_id,updated_at,updated_by) VALUES (?,?,?)").bind(id,now,access.viewer.email), ...emails.map((email: string) => db.prepare("INSERT INTO franchise_members (store_id,email,created_at) VALUES (?,?,?)").bind(id,email,now))]);
  return NextResponse.json({ id, name });
}
