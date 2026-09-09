import { NextResponse } from "next/server";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";
import { razorpayConfig } from "../../payments/razorpay";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { projectId } = await request.json() as any;
  const project = await database().prepare("SELECT id, COALESCE(project_code, 'PB-' || upper(substr(replace(id,'-',''),1,8))) project_code, title, final_price_paise FROM projects WHERE id=? AND status='PUBLISHED'").bind(String(projectId ?? "")).first<any>();
  if (!project) return NextResponse.json({ error: "Project unavailable" }, { status: 404 });
  const listed = project.final_price_paise, buyerBase = Math.round(listed * 1.05), sellerPayout = Math.round(listed * 0.95), platformFee = buyerBase - sellerPayout, gatewayFee = Math.round(buyerBase * 0.0236), amount = buyerBase + gatewayFee;
  const id = crypto.randomUUID(), now = new Date().toISOString(), { keyId, keySecret } = razorpayConfig();
  const created = await fetch("https://api.razorpay.com/v1/orders", { method: "POST", headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, "Content-Type": "application/json" }, body: JSON.stringify({ amount, currency: "INR", receipt: `PROJECT-${id}`, notes: { printbee_project_order_id: id, project_code: project.project_code } }) }).then(r => r.ok ? r.json() : null);
  if (!created?.id) return NextResponse.json({ error: "Payment could not be started" }, { status: 502 });
  await database().prepare("INSERT INTO project_orders (id,project_id,buyer_email,amount_paise,gateway_fee_paise,listed_price_paise,seller_payout_paise,platform_fee_paise,razorpay_order_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id, project.id, viewer.email, amount, gatewayFee, listed, sellerPayout, platformFee, created.id, now).run();
  return NextResponse.json({ orderId: id, razorpayOrderId: created.id, keyId, amount, gatewayFee, projectCode: project.project_code, title: project.title });
}
