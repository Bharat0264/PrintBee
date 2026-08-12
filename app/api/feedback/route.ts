import { NextResponse } from "next/server";
import { database } from "../db";
import { getViewer } from "../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await request.json() as any;
  const ratings = [body.serviceRating, body.riderRating, body.printQualityRating, body.overallRating].map(Number);
  if (!body.orderId || ratings.some((rating) => !Number.isInteger(rating) || rating < 1 || rating > 5)) return NextResponse.json({ error: "Please rate every item from 1 to 5 stars" }, { status: 400 });
  const order = await database().prepare("SELECT id FROM orders WHERE id=? AND customer_email=? AND status='DELIVERED'").bind(body.orderId, viewer.email).first();
  if (!order) return NextResponse.json({ error: "Feedback is available after delivery" }, { status: 400 });
  const result = await database().prepare("INSERT OR IGNORE INTO order_feedback (order_id,customer_email,service_rating,rider_rating,print_quality_rating,overall_rating,description,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(body.orderId, viewer.email, ...ratings, String(body.description ?? "").trim().slice(0, 1000) || null, new Date().toISOString()).run();
  if (!result.meta.changes) return NextResponse.json({ error: "Feedback was already submitted for this order" }, { status: 409 });
  return NextResponse.json({ submitted: true });
}
