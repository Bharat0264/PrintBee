import { NextResponse } from "next/server";
import { database } from "../../../../db";
import { franchiseAccess } from "../../../access";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function storeExists(storeId: string) {
  return database().prepare("SELECT id FROM franchise_stores WHERE id=? AND active=1").bind(storeId).first<{ id: string }>();
}

export async function POST(request: Request, context: { params: Promise<{ storeId: string }> }) {
  const access = await franchiseAccess();
  if (!access.viewer?.isAdmin) return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  const { storeId } = await context.params;
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!emailPattern.test(email)) return NextResponse.json({ error: "Enter a valid manager email" }, { status: 400 });
  if (!await storeExists(storeId)) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  await database().prepare("INSERT INTO franchise_members (store_id,email,created_at) VALUES (?,?,?) ON CONFLICT(store_id,email) DO NOTHING").bind(storeId, email, new Date().toISOString()).run();
  return NextResponse.json({ email });
}

export async function DELETE(request: Request, context: { params: Promise<{ storeId: string }> }) {
  const access = await franchiseAccess();
  if (!access.viewer?.isAdmin) return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  const { storeId } = await context.params;
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!emailPattern.test(email)) return NextResponse.json({ error: "Enter a valid manager email" }, { status: 400 });
  if (!await storeExists(storeId)) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  await database().prepare("DELETE FROM franchise_members WHERE store_id=? AND lower(email)=?").bind(storeId, email).run();
  return NextResponse.json({ removed: true, email });
}
