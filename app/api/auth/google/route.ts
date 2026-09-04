import { NextResponse } from "next/server";
import { database } from "../../../api/db";

const GOOGLE_CLIENT_ID = "365409440317-vn99jp0h6jd5suom0gppbjoubvs8sqio.apps.googleusercontent.com";

type GoogleToken = { aud?: string; email?: string; email_verified?: string | boolean; name?: string; sub?: string };

export async function POST(request: Request) {
  let credential = "";
  try { credential = String((await request.json()).credential ?? ""); } catch { /* handled below */ }
  if (!credential || credential.length > 12_000) return NextResponse.json({ error: "Google sign-in could not be verified." }, { status: 400 });

  try {
    const verify = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, { headers: { accept: "application/json" } });
    if (!verify.ok) return NextResponse.json({ error: "Google sign-in could not be verified." }, { status: 401 });
    const token = await verify.json() as GoogleToken;
    const email = token.email?.trim().toLowerCase();
    if (token.aud !== GOOGLE_CLIENT_ID || token.email_verified !== true && token.email_verified !== "true" || !email || !token.sub) {
      return NextResponse.json({ error: "Use a verified Google account to continue." }, { status: 401 });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const sessionId = crypto.randomUUID();
    const db = database();
    await db.batch([
      db.prepare("INSERT INTO app_users (email, role, created_at, name) VALUES (?, 'CUSTOMER', ?, ?) ON CONFLICT(email) DO UPDATE SET name=COALESCE(app_users.name, excluded.name)").bind(email, now.toISOString(), token.name?.slice(0, 120) ?? email),
      db.prepare("INSERT INTO local_sessions (id, email, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(sessionId, email, expiresAt, now.toISOString()),
      db.prepare("DELETE FROM local_sessions WHERE expires_at<=?").bind(now.toISOString()),
    ]);
    const response = NextResponse.json({ ok: true });
    response.cookies.set("printbee_local_session", sessionId, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 });
    return response;
  } catch {
    return NextResponse.json({ error: "Google sign-in is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
