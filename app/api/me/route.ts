import { NextResponse } from "next/server";
import { database } from "../db";
import { getViewer } from "../../supabase/server";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ role: null });
  if (viewer.isAdmin) return NextResponse.json({ role: "ADMIN" });
  const row = await database().prepare("SELECT role FROM app_users WHERE email = ?").bind(viewer.email).first<{ role: string }>();
  return NextResponse.json({ role: row?.role ?? "CUSTOMER" });
}
