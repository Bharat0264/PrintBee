import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";

export async function GET(_: Request, context: { params: Promise<{ orderId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { orderId } = await context.params;
  const order = await database().prepare("SELECT * FROM orders WHERE id=? AND payment_status='PAID'").bind(orderId).first<any>();
  if (!order || (!viewer.isAdmin && order.customer_email !== viewer.email)) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  let items: any[] = [];
  try { items = JSON.parse(order.items_json); } catch {}
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595.28, 841.89]);
  const money = (paise: number) => `INR ${(Number(paise || 0) / 100).toFixed(2)}`;
  page.drawRectangle({ x: 0, y: 760, width: 595.28, height: 82, color: rgb(.07, .08, .11) });
  page.drawText("PRINTBEE", { x: 42, y: 805, size: 12, font: bold, color: rgb(.96, .72, .02) });
  page.drawText("TAX INVOICE", { x: 390, y: 801, size: 19, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Document printing and local delivery", { x: 42, y: 782, size: 9, font: regular, color: rgb(.8, .82, .86) });
  page.drawText(`Invoice: ${order.order_number}`, { x: 42, y: 730, size: 11, font: bold });
  page.drawText(`Date: ${new Date(order.payment_verified_at || order.created_at).toLocaleString("en-IN")}`, { x: 340, y: 730, size: 8, font: regular });
  page.drawText("BILLED TO", { x: 42, y: 694, size: 8, font: bold, color: rgb(.35, .38, .42) });
  page.drawText(String(order.customer_name), { x: 42, y: 677, size: 11, font: bold });
  page.drawText(`${order.customer_email} | ${order.mobile_number}`, { x: 42, y: 662, size: 8, font: regular });
  page.drawText(`Delivery location: ${order.location_name}`, { x: 42, y: 648, size: 8, font: regular });
  let y = 606;
  page.drawRectangle({ x: 38, y: y - 4, width: 519, height: 24, color: rgb(.94, .94, .92) });
  page.drawText("DESCRIPTION", { x: 45, y: y + 4, size: 8, font: bold });
  page.drawText("QTY", { x: 395, y: y + 4, size: 8, font: bold });
  page.drawText("AMOUNT", { x: 478, y: y + 4, size: 8, font: bold });
  y -= 28;
  for (const item of items.slice(0, 12)) {
    const description = item.kind === "ADDON" ? `${item.fileName} - optional product` : `${item.fileName} - ${item.pages || 1} pages, ${item.copies || 1} copies, ${String(item.mode || "").replaceAll("-", " ")}`;
    page.drawText(description.slice(0, 66), { x: 45, y, size: 8, font: regular });
    page.drawText(String(item.copies || 1), { x: 398, y, size: 8, font: regular });
    page.drawText(money(Math.round(Number(item.total || 0) * 100)), { x: 478, y, size: 8, font: regular });
    page.drawLine({ start: { x: 38, y: y - 9 }, end: { x: 557, y: y - 9 }, thickness: .4, color: rgb(.87, .87, .84) });
    y -= 25;
  }
  const lines: Array<[string, number]> = [["Printing and products", order.printing_subtotal_paise], ["Delivery", order.delivery_fee_paise], ["Platform fee", order.platform_fee_paise], ["Packaging", order.packaging_fee_paise], ["Payment gateway fee", order.payment_gateway_fee_paise], ["Surge charge", order.surge_fee_paise], ["Late-night delivery", order.late_night_fee_paise], ["Points discount", -Number(order.points_discount_paise || 0)]];
  y = Math.min(y - 20, 300);
  for (const [label, amount] of lines.filter(([, amount]) => amount !== 0)) { page.drawText(label, { x: 340, y, size: 8, font: regular }); page.drawText(money(amount), { x: 478, y, size: 8, font: regular }); y -= 17; }
  page.drawLine({ start: { x: 335, y: y + 5 }, end: { x: 557, y: y + 5 }, thickness: 1, color: rgb(.12, .12, .14) });
  page.drawText("TOTAL PAID", { x: 340, y: y - 14, size: 10, font: bold });
  page.drawText(money(order.total_paise), { x: 478, y: y - 14, size: 10, font: bold });
  page.drawText(`Payment reference: ${order.razorpay_payment_id || order.payment_reference || "Verified online payment"}`, { x: 42, y: 92, size: 8, font: regular });
  page.drawText("GST is not charged separately unless shown above. This computer-generated invoice requires no signature.", { x: 42, y: 64, size: 7.5, font: regular, color: rgb(.35, .38, .42) });
  page.drawText("PrintBee | printbee.co.in@gmail.com | www.printbee.co.in", { x: 42, y: 42, size: 8, font: bold });
  const bytes = await pdf.save();
  return new Response(bytes as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="PrintBee-${order.order_number}-invoice.pdf"`, "Cache-Control": "private, no-store" } });
}
