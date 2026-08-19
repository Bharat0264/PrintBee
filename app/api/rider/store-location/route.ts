import { NextResponse } from "next/server";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!viewer.isAdmin) {
    const rider = await database().prepare("SELECT role FROM app_users WHERE email=? AND role='AGENT' AND approval_status='APPROVED'").bind(viewer.email).first();
    if (!rider) return NextResponse.json({ error: "Rider access required" }, { status: 403 });
  }
  const store = await database().prepare("SELECT latitude,longitude FROM store_location WHERE id='main'").first<{ latitude: number; longitude: number }>();
  return NextResponse.json(store ?? { configured: false });
}
