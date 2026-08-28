import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { database } from "../../api/db";

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
async function hash(password: string, salt: string) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: Uint8Array.from(atob(salt), c => c.charCodeAt(0)), iterations: 210000, hash: "SHA-256" }, material, 256);
  return encode(new Uint8Array(bits));
}
async function startSession(email: string) {
  const id = crypto.randomUUID(); const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await database().prepare("INSERT INTO local_sessions (id,email,expires_at,created_at) VALUES (?,?,?,?)").bind(id, email, expires.toISOString(), new Date().toISOString()).run();
  const response = NextResponse.json({ ok: true });
  response.cookies.set("printbee_local_session", id, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires }); return response;
}
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})); const email = String(body.email ?? "").trim().toLowerCase(); const password = String(body.password ?? ""); const mode = body.mode === "register" ? "register" : "login";
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return NextResponse.json({ error: "Use a valid email and a password with at least 8 characters." }, { status: 400 });
  const db = database(); const existing = await db.prepare("SELECT email,password_salt,password_hash FROM local_accounts WHERE email=?").bind(email).first<any>();
  if (mode === "register") {
    const name = String(body.name ?? "").trim(); const mobile = String(body.mobileNumber ?? "").replace(/\D/g, "");
    if (!name || mobile.length !== 10) return NextResponse.json({ error: "Enter your name and a 10-digit mobile number." }, { status: 400 });
    if (existing) return NextResponse.json({ error: "An account already exists. Please sign in." }, { status: 409 });
    const salt = encode(crypto.getRandomValues(new Uint8Array(16))); const passwordHash = await hash(password, salt);
    await db.prepare("INSERT INTO local_accounts (email,name,mobile_number,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?)").bind(email,name,mobile,salt,passwordHash,new Date().toISOString()).run();
    return startSession(email);
  }
  if (!existing || (await hash(password, existing.password_salt)) !== existing.password_hash) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  return startSession(email);
}
export async function DELETE() { const id = (await cookies()).get("printbee_local_session")?.value; if (id) await database().prepare("DELETE FROM local_sessions WHERE id=?").bind(id).run(); const response = NextResponse.json({ ok: true }); response.cookies.set("printbee_local_session", "", { httpOnly:true, secure:true, sameSite:"lax", path:"/", maxAge:0 }); return response; }
