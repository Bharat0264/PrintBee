import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin || !["OWNER", "OPERATIONS"].includes(viewer.adminRole || "")) return NextResponse.json({ error: "Operations access required" }, { status: 403 });
  const { email } = await request.json() as { email?: string };
  const cleanEmail = email?.trim().toLowerCase();
  const db = database();
  const rider = await db.prepare("SELECT email FROM app_users WHERE email=? AND role='AGENT' AND approval_status='APPROVED'").bind(cleanEmail).first();
  if (!rider) return NextResponse.json({ error: "Active delivery partner not found" }, { status: 404 });
  await db.batch([
    db.prepare("UPDATE app_users SET approval_status='REMOVED' WHERE email=?").bind(cleanEmail),
    db.prepare("UPDATE orders SET rider_email=NULL, status='READY_FOR_PICKUP' WHERE rider_email=? AND status='RIDER_ASSIGNED'").bind(cleanEmail),
  ]);
  return NextResponse.json({ removed: true });
}
