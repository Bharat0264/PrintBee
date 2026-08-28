import { NextResponse } from "next/server";
import { createAppwriteAdminAccount } from "../../appwrite/server";

export async function POST(request: Request) {
  const { email, password } = await request.json().catch(() => ({}));
  if (typeof email !== "string" || typeof password !== "string") return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  try {
    const session = await createAppwriteAdminAccount().createEmailPasswordSession({ email, password });
    const response = NextResponse.json({ ok: true });
    response.cookies.set("printbee_appwrite_session", session.secret, { httpOnly: true, sameSite: "lax", secure: true, path: "/", expires: new Date(session.expire) });
    return response;
  } catch { return NextResponse.json({ error: "Invalid credentials" }, { status: 401 }); }
}
