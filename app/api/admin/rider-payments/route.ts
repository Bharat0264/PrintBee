import { NextResponse } from "next/server";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await request.json() as { riderEmail?: string; amount?: number; paymentDate?: string; note?: string };
  const riderEmail = body.riderEmail?.trim().toLowerCase();
  const paymentDate = body.paymentDate?.trim();
  const amountPaise = Math.round(Number(body.amount) * 100);

  if (!riderEmail || !paymentDate || !Number.isFinite(amountPaise) || amountPaise <= 0) {
    return NextResponse.json({ error: "Rider, date and a valid amount are required" }, { status: 400 });
  }

  const db = database();
  const rider = await db.prepare("SELECT email FROM app_users WHERE email=? AND role='AGENT'").bind(riderEmail).first();
  if (!rider) return NextResponse.json({ error: "Rider not found" }, { status: 404 });

  await db.prepare(
    "INSERT INTO rider_payments (id, rider_email, amount_paise, payment_date, note, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), riderEmail, amountPaise, paymentDate, body.note?.trim() || null, viewer.email, new Date().toISOString()).run();

  return NextResponse.json({ ok: true });
}
