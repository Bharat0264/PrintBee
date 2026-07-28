import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { email, approved } = await request.json() as { email?: string; approved?: boolean };
  const result = await database().prepare("UPDATE app_users SET approval_status=? WHERE email=? AND role='AGENT'").bind(approved ? "APPROVED" : "REJECTED", email?.toLowerCase()).run();
  if (!result.meta.changes) return NextResponse.json({ error: "Rider application not found" }, { status: 404 });
  return NextResponse.json({ updated: true });
}
