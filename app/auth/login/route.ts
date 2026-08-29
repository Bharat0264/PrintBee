import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.redirect(new URL("/?login=failed", origin));
  try {
    const response = NextResponse.redirect(new URL("/", origin));
    const { createServerClient } = await import("@supabase/ssr");
    const supabase = createServerClient(url, key, { cookies: { getAll: () => request.headers.get("cookie")?.split(";").map((value) => {
      const [name, ...parts] = value.trim().split("="); return { name, value: parts.join("=") };
    }) ?? [], setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback` },
    });
    if (error || !data.url) throw error ?? new Error("Google sign-in is unavailable");
    response.headers.set("Location", data.url);
    return response;
  } catch {
    return NextResponse.redirect(new URL("/?login=failed", origin));
  }
}
