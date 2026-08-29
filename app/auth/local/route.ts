import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Email and password sign-in is disabled. Continue with Google instead." }, { status: 410 });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("printbee_local_session", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
