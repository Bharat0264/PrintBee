import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
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
