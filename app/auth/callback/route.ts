import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const response = NextResponse.redirect(new URL("/", url.origin));
  const code = url.searchParams.get("code");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!code || !supabaseUrl || !key) return NextResponse.redirect(new URL("/?login=failed", url.origin));
  try {
    const { createServerClient } = await import("@supabase/ssr");
    const supabase = createServerClient(supabaseUrl, key, { cookies: {
      getAll: () => request.headers.get("cookie")?.split(";").map((value) => { const [name, ...parts] = value.trim().split("="); return { name, value: parts.join("=") }; }) ?? [],
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    } });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return response;
  } catch { return NextResponse.redirect(new URL("/?login=failed", url.origin)); }
}
