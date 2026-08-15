import { NextResponse } from "next/server";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return NextResponse.json({ error: "Push notifications are not configured" }, { status: 503 });
  return NextResponse.json({ publicKey });
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const subscription = await request.json() as { endpoint?: string };
  if (!subscription.endpoint) return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  const now = new Date().toISOString();
  await database().prepare("INSERT INTO push_subscriptions (id,email,endpoint,subscription_json,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET email=excluded.email,subscription_json=excluded.subscription_json,updated_at=excluded.updated_at")
    .bind(crypto.randomUUID(), viewer.email, subscription.endpoint, JSON.stringify(subscription), now, now).run();
  return NextResponse.json({ subscribed: true });
}

export async function DELETE(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { endpoint } = await request.json() as { endpoint?: string };
  await database().prepare("DELETE FROM push_subscriptions WHERE email=? AND endpoint=?").bind(viewer.email, endpoint).run();
  return NextResponse.json({ unsubscribed: true });
}
