import { NextResponse } from "next/server";
import { createAppwriteAdminAccount } from "../../appwrite/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const secret = url.searchParams.get("secret");
  const response = NextResponse.redirect(new URL("/", url.origin));
  if (!userId || !secret) return response;
  try {
    const session = await createAppwriteAdminAccount().createSession({ userId, secret });
    response.cookies.set("printbee_appwrite_session", session.secret, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      expires: new Date(session.expire),
    });
  } catch { return NextResponse.redirect(new URL("/?login=failed", url.origin)); }
  return response;
}
