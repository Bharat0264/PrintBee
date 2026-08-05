import { NextResponse } from "next/server";
import { database } from "../db";
import { getViewer } from "../../supabase/server";

export async function GET() {
  const row = await database().prepare("SELECT accepting_orders, launch_at, launch_message FROM order_availability WHERE id='main'").first<{ accepting_orders: number; launch_at: string; launch_message: string }>();
  return NextResponse.json({ acceptingOrders: row?.accepting_orders !== 0, launchAt: row?.launch_at ?? "2026-08-10T03:30:00.000Z", launchMessage: row?.launch_message ?? "Site will be live from Aug 10 2026, 9 A.M. IST" }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { acceptingOrders, launchAt, launchMessage } = await request.json() as { acceptingOrders?: boolean; launchAt?: string; launchMessage?: string };
  if (typeof acceptingOrders !== "boolean") return NextResponse.json({ error: "Choose ON or OFF" }, { status: 400 });
  const parsedLaunchAt = new Date(String(launchAt));
  const message = launchMessage?.trim().slice(0, 160);
  if (Number.isNaN(parsedLaunchAt.getTime()) || !message) return NextResponse.json({ error: "Enter a valid launch time and message" }, { status: 400 });
  await database().prepare("INSERT INTO order_availability (id,accepting_orders,launch_at,launch_message,updated_at,updated_by) VALUES ('main',?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET accepting_orders=excluded.accepting_orders,launch_at=excluded.launch_at,launch_message=excluded.launch_message,updated_at=excluded.updated_at,updated_by=excluded.updated_by")
    .bind(acceptingOrders ? 1 : 0, parsedLaunchAt.toISOString(), message, new Date().toISOString(), viewer.email).run();
  return NextResponse.json({ acceptingOrders, launchAt: parsedLaunchAt.toISOString(), launchMessage: message }, { headers: { "Cache-Control": "no-store" } });
}
