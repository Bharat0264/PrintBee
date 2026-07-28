import { NextResponse } from "next/server";
import { database } from "../db";
import { getViewer } from "../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { email } = await request.json() as { email?: string };
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) return NextResponse.json({ error: "Valid agent email required" }, { status: 400 });
  await database().prepare("INSERT INTO app_users (email, role, created_at, approval_status) VALUES (?, 'AGENT', ?, 'APPROVED') ON CONFLICT(email) DO UPDATE SET role = 'AGENT', approval_status='APPROVED'").bind(cleanEmail, new Date().toISOString()).run();
  return NextResponse.json({ email: cleanEmail, role: "AGENT" });
}
