import { NextResponse } from "next/server";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const available = Boolean((await request.json() as any).available);
  const result = await database().prepare("UPDATE app_users SET is_available=? WHERE email=? AND role='AGENT' AND approval_status='APPROVED'").bind(available ? 1 : 0, viewer.email).run();
  if (!result.meta.changes) return NextResponse.json({ error: "Approved rider access required" }, { status: 403 });
  return NextResponse.json({ isAvailable: available });
}
