import { NextResponse } from "next/server";
import { database } from "../db";
import { getViewer } from "../../supabase/server";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ role: null });
  const db = database();
  const row = await db.prepare("SELECT role, approval_status, is_available FROM app_users WHERE email = ?").bind(viewer.email).first<{ role: string; approval_status: string; is_available: number }>();
  let profile = await db.prepare("SELECT referral_code, points_balance, referred_by_email FROM customer_profiles WHERE email=?").bind(viewer.email).first<any>();
  if (!profile) {
    for (let attempt = 0; attempt < 5 && !profile; attempt += 1) {
      const code = `PB${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
      await db.prepare("INSERT OR IGNORE INTO customer_profiles (email,referral_code,points_balance,created_at) VALUES (?,?,10,?)").bind(viewer.email, code, new Date().toISOString()).run();
      profile = await db.prepare("SELECT referral_code, points_balance, referred_by_email FROM customer_profiles WHERE email=?").bind(viewer.email).first<any>();
    }
  }
  return NextResponse.json({ role: viewer.isAdmin ? "ADMIN" : row?.role ?? "CUSTOMER", approvalStatus: row?.approval_status ?? null, isAvailable: Boolean(row?.is_available), referralCode: profile?.referral_code, pointsBalance: profile?.points_balance ?? 10, hasReferrer: Boolean(profile?.referred_by_email) });
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const code = String((await request.json() as any).referralCode ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ skipped: true });
  const db = database();
  const owner = await db.prepare("SELECT email FROM customer_profiles WHERE referral_code=?").bind(code).first<{ email: string }>();
  if (!owner) return NextResponse.json({ error: "Referral code is not valid" }, { status: 400 });
  if (owner.email === viewer.email) return NextResponse.json({ error: "You cannot use your own referral code" }, { status: 400 });
  const result = await db.prepare("UPDATE customer_profiles SET referred_by_email=? WHERE email=? AND referred_by_email IS NULL").bind(owner.email, viewer.email).run();
  if (!result.meta.changes) return NextResponse.json({ error: "A referral is already linked to this account" }, { status: 409 });
  return NextResponse.json({ verified: true });
}
