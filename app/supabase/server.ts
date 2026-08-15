import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { database } from "../api/db";

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

  let adminRole: "OWNER" | "OPERATIONS" | "ACCOUNTANT" | "SUPPORT" | null = ADMIN_EMAILS.has(email) ? "OWNER" : null;
  try {
    const member = await database().prepare("SELECT role FROM admin_members WHERE email=?").bind(email).first<{ role: typeof adminRole }>();
    if (member?.role) adminRole = member.role;
  } catch { /* Migration may not have reached a newly created preview yet. */ }
  return { email, isAdmin: Boolean(adminRole), adminRole };
}

export async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("ADMIN_ACCESS_REQUIRED");
  return viewer;
}

export async function requireAdminRole(allowed: Array<"OWNER" | "OPERATIONS" | "ACCOUNTANT" | "SUPPORT">) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin || !viewer.adminRole || !allowed.includes(viewer.adminRole)) throw new Error("ADMIN_ACCESS_REQUIRED");
  return viewer;
}
