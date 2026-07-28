import { NextResponse } from "next/server";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in with Google before applying" }, { status: 401 });
  const { name, mobileNumber } = await request.json() as { name?: string; mobileNumber?: string };
  const cleanName = name?.trim();
  const mobile = mobileNumber?.replace(/\D/g, "");
  if (!cleanName || mobile?.length !== 10) return NextResponse.json({ error: "Name and a 10-digit mobile number are required" }, { status: 400 });
  await database().prepare(
    "INSERT INTO app_users (email, role, created_at, name, mobile_number, approval_status) VALUES (?, 'AGENT', ?, ?, ?, 'PENDING') ON CONFLICT(email) DO UPDATE SET name=excluded.name, mobile_number=excluded.mobile_number, approval_status=CASE WHEN app_users.approval_status='APPROVED' THEN 'APPROVED' ELSE 'PENDING' END"
  ).bind(viewer.email, new Date().toISOString(), cleanName, mobile).run();
  return NextResponse.json({ submitted: true });
}
