import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const ADMIN_EMAILS = new Set([
  "bharathsaipulipati@gmail.com",
  "raniramyasana@gmail.com",
]);

export async function getViewer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) return null;

  return { email, isAdmin: ADMIN_EMAILS.has(email) };
}

export async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("ADMIN_ACCESS_REQUIRED");
  return viewer;
}
