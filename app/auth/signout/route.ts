import { NextResponse } from "next/server";
import { database } from "../../api/db";

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  const localSession = request.headers.get("cookie")?.match(/(?:^|;\\s*)printbee_local_session=([^;]+)/)?.[1];
  if (localSession) {
    try { await database().prepare("DELETE FROM local_sessions WHERE id=?").bind(localSession).run(); } catch { /* Clear the cookie even if the database is temporarily unavailable. */ }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const { createServerClient } = await import("@supabase/ssr");
    const supabase = createServerClient(url, key, { cookies: {
      getAll: () => request.headers.get("cookie")?.split(";").map((value) => { const [name, ...parts] = value.trim().split("="); return { name, value: parts.join("=") }; }) ?? [],
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    } });
    await supabase.auth.signOut();
  }
  response.cookies.set("printbee_local_session", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
