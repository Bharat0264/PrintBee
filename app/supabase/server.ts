import { cookies } from "next/headers";
import { Account, Client } from "node-appwrite";
import { database } from "../api/db";

const ADMIN_EMAILS = new Set([
  "bharathsaipulipati@gmail.com",
  "raniramyasana@gmail.com",
]);

export async function getViewer() {
  const cookieStore = await cookies();
  const localSession = cookieStore.get("printbee_local_session")?.value;
  if (localSession) {
    const local = await database().prepare("SELECT a.email FROM local_sessions s JOIN local_accounts a ON a.email=s.email WHERE s.id=? AND s.expires_at>? LIMIT 1").bind(localSession, new Date().toISOString()).first<{ email: string }>().catch(() => null);
    if (local?.email) {
      const email = local.email.toLowerCase();
      let adminRole: "OWNER" | "OPERATIONS" | "ACCOUNTANT" | "SUPPORT" | null = ADMIN_EMAILS.has(email) ? "OWNER" : null;
      const member = await database().prepare("SELECT role FROM admin_members WHERE email=?").bind(email).first<{ role: typeof adminRole }>().catch(() => null);
      if (member?.role) adminRole = member.role;
      return { email, isAdmin: Boolean(adminRole), adminRole };
    }
  }
  const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const { createServerClient } = await import("@supabase/ssr");
  const supabase = createServerClient(url, key, { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } });
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
