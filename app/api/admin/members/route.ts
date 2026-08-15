import { NextResponse } from "next/server";
import { database } from "../../db";
import { requireAdminRole } from "../../../supabase/server";

const roles = new Set(["OWNER", "OPERATIONS", "ACCOUNTANT", "SUPPORT"]);

export async function POST(request: Request) {
  let viewer;
  try { viewer = await requireAdminRole(["OWNER"]); } catch { return NextResponse.json({ error: "Owner access required" }, { status: 403 }); }
  const body = await request.json() as { email?: string; role?: string };
  const email = body.email?.trim().toLowerCase();
  const role = body.role?.toUpperCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !role || !roles.has(role)) return NextResponse.json({ error: "Enter a valid email and admin role" }, { status: 400 });
  const now = new Date().toISOString();
  await database().prepare("INSERT INTO admin_members (email,role,created_at,created_by,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role,updated_at=excluded.updated_at")
    .bind(email, role, now, viewer.email, now).run();
  return NextResponse.json({ email, role });
}

export async function DELETE(request: Request) {
  let viewer;
  try { viewer = await requireAdminRole(["OWNER"]); } catch { return NextResponse.json({ error: "Owner access required" }, { status: 403 }); }
  const email = String((await request.json() as any).email ?? "").toLowerCase();
  if (!email || email === viewer.email) return NextResponse.json({ error: "You cannot remove your own owner access" }, { status: 400 });
  await database().prepare("DELETE FROM admin_members WHERE email=?").bind(email).run();
  return NextResponse.json({ removed: true });
}
