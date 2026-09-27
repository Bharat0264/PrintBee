import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";
import { sendPushToEmail } from "../../../push/send";
import { ensureTrackingTables, transitionOrder } from "../../../delivery/tracking";

const allowed = new Set(["CONFIRMED", "PRINTING", "READY_FOR_PICKUP", "PLAGIARISM_SUBMITTED", "PLAGIARISM_REPORT_RECEIVED"]);

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin || !["OWNER", "OPERATIONS"].includes(viewer.adminRole || "")) return NextResponse.json({ error: "Operations access required" }, { status: 403 });
  const { orderId, status } = await request.json() as { orderId?: string; status?: string };
  if (!status || !allowed.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  const db = database();
  const order = await db.prepare("SELECT order_number,customer_email,items_json FROM orders WHERE id=? AND payment_status='PAID'").bind(orderId).first<{ order_number: string; customer_email: string; items_json: string }>();
  const plagiarismOnly = (() => { try { const items = JSON.parse(order?.items_json || "[]"); return Array.isArray(items) && items.length > 0 && items.every((item: any) => item?.serviceId === "turnitin-plagiarism-check"); } catch { return false; } })();
  if (["PLAGIARISM_SUBMITTED", "PLAGIARISM_REPORT_RECEIVED", "DELIVERED"].includes(status) && !plagiarismOnly) return NextResponse.json({ error: "This update is only for plagiarism-report orders" }, { status: 400 });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (["PLAGIARISM_SUBMITTED", "PLAGIARISM_REPORT_RECEIVED"].includes(status)) {
    await db.prepare("UPDATE orders SET status=? WHERE id=? AND payment_status='PAID' AND status NOT IN ('DELIVERED','CANCELLED')").bind(status, orderId).run();
  } else {
    await ensureTrackingTables();
    const current = await db.prepare("SELECT status FROM orders WHERE id=?").bind(orderId).first<{ status: string }>();
    if (!current || !await transitionOrder(orderId, current.status, status, viewer.email, "ADMIN")) return NextResponse.json({ error: "This status transition is not available" }, { status: 409 });
  }
  if (order) void sendPushToEmail(order.customer_email, { title: "Order updated", body: `${order.order_number} is now ${status.replaceAll("_", " ").toLowerCase()}.`, tag: `${orderId}-${status}`, url: "/" });
  return NextResponse.json({ updated: true });
}
