import { NextResponse } from "next/server";
import { database } from "../db";
import { getViewer } from "../../supabase/server";

export async function GET() {
  const row = await database().prepare("SELECT accepting_orders FROM order_availability WHERE id='main'").first<{ accepting_orders: number }>();
  return NextResponse.json({ acceptingOrders: row?.accepting_orders !== 0 }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { acceptingOrders } = await request.json() as { acceptingOrders?: boolean };
  if (typeof acceptingOrders !== "boolean") return NextResponse.json({ error: "Choose ON or OFF" }, { status: 400 });
  await database().prepare("INSERT INTO order_availability (id,accepting_orders,updated_at,updated_by) VALUES ('main',?,?,?) ON CONFLICT(id) DO UPDATE SET accepting_orders=excluded.accepting_orders,updated_at=excluded.updated_at,updated_by=excluded.updated_by")
    .bind(acceptingOrders ? 1 : 0, new Date().toISOString(), viewer.email).run();
  return NextResponse.json({ acceptingOrders }, { headers: { "Cache-Control": "no-store" } });
}
