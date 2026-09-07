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
    try {
      const session = await database().prepare("SELECT email FROM local_sessions WHERE id=? AND expires_at>? ").bind(localSession, new Date().toISOString()).first<{ email: string }>();
      if (session?.email) return viewerForEmail(session.email);
    } catch { /* The session tables may not have reached a newly created preview yet. */ }
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

  return viewerForEmail(email);
}

async function viewerForEmail(email: string) {
  let adminRole: "OWNER" | "OPERATIONS" | "ACCOUNTANT" | "SUPPORT" | null = ADMIN_EMAILS.has(email) ? "OWNER" : null;
  try {
    const member = await database().prepare("SELECT role FROM admin_members WHERE email=?").bind(email).first<{ role: typeof adminRole }>();
    if (member?.role) adminRole = member.role;
  } catch { /* Migration may not have reached a newly created preview yet. */ }
  let isFranchise = false;
  try { isFranchise = Boolean(await database().prepare("SELECT 1 FROM franchise_members WHERE lower(email)=? LIMIT 1").bind(email).first()); } catch { /* Franchise tables may not exist on an older deployment. */ }
  return { email, isAdmin: Boolean(adminRole), adminRole, isFranchise };
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
