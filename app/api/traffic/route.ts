import { NextResponse } from "next/server";
import { database } from "../db";

const EVENTS = new Set(["PAGE_VIEW", "CHECKOUT_STARTED"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { event?: string; visitorId?: string; path?: string } | null;
  const visitorId = body?.visitorId?.trim();
  const path = body?.path?.trim() || "/";
  if (!body?.event || !EVENTS.has(body.event) || !visitorId || !/^[a-zA-Z0-9-]{20,80}$/.test(visitorId) || path.length > 250) return NextResponse.json({ error: "Invalid traffic event" }, { status: 400 });
  await database().prepare("INSERT INTO traffic_events (id,visitor_id,event,path,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), visitorId, body.event, path, new Date().toISOString()).run();
  return NextResponse.json({ recorded: true }, { status: 201 });
}
