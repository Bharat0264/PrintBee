import { NextResponse } from "next/server";
import { createAppwriteAdminAccount, OAuthProvider } from "../../appwrite/server";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  try {
    const url = await createAppwriteAdminAccount().createOAuth2Token({
      provider: OAuthProvider.Google,
      success: `${origin}/auth/callback`,
      failure: `${origin}/?login=failed`,
    });
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.redirect(new URL("/?login=failed", origin));
  }
}
