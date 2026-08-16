import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";

const PASSWORD_HASH = "d37f1766fb8548adf59aaf7d2c2024e2b0c16fcad5b8a875cf2f57a102e6c5a3";
const ACCESS_TOKEN = "eae7e51b12310bb2cc9878dbded316dc96a242d99ec69c51f877f178d0c3307e";
const COOKIE_NAME = "printbee-ledger-access";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requireLedgerAccess() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return false;
  return (await cookies()).get(COOKIE_NAME)?.value === ACCESS_TOKEN;
}

type LedgerValues = {
  orders: number;
  bwPages: number;
  bwRevenuePaise: number;
  bwCostPaise: number;
  colourPages: number;
  colourRevenuePaise: number;
  colourCostPaise: number;
  deliveryProfitPaise: number;
  platformRevenuePaise: number;
  packingProfitPaise: number;
};

function emptyValues(): LedgerValues {
  return { orders: 0, bwPages: 0, bwRevenuePaise: 0, bwCostPaise: 0, colourPages: 0, colourRevenuePaise: 0, colourCostPaise: 0, deliveryProfitPaise: 0, platformRevenuePaise: 0, packingProfitPaise: 0 };
}

function addItem(values: LedgerValues, item: any) {
  if (item?.kind === "ADDON") return;
  const pages = Math.max(1, Number(item?.pages) || 1);
  const copies = Math.max(1, Number(item?.copies) || 1);
  const isDouble = String(item?.mode || "").endsWith("double");
  const divisor = isDouble ? 2 : 1;
  const colourPerCopy = item?.colourPageNumbers !== undefined
    ? Math.max(0, Math.min(pages, Number(item?.colourPages) || 0))
    : String(item?.mode || "").startsWith("colour") ? pages : 0;
  const bwPerCopy = pages - colourPerCopy;
  const bwPages = bwPerCopy * copies;
  const colourPages = colourPerCopy * copies;
  const bwUnitPrice = Number(item?.bwUnitPrice ?? (String(item?.mode || "").startsWith("bw") ? item?.unitPrice : 0)) || 0;
  const colourUnitPrice = Number(item?.colourUnitPrice ?? (String(item?.mode || "").startsWith("colour") ? item?.unitPrice : 0)) || 0;
  values.bwPages += bwPages;
  values.colourPages += colourPages;
  values.bwRevenuePaise += Math.round((bwPages / divisor) * bwUnitPrice * 100);
  values.colourRevenuePaise += Math.round((colourPages / divisor) * colourUnitPrice * 100);
  values.bwCostPaise += bwPages * (isDouble ? 75 : 65);
  values.colourCostPaise += colourPages * (isDouble ? 200 : 150);
}

function finish(values: LedgerValues) {
  const bwProfitPaise = values.bwRevenuePaise - values.bwCostPaise;
  const colourProfitPaise = values.colourRevenuePaise - values.colourCostPaise;
  const printingProfitPaise = bwProfitPaise + colourProfitPaise;
  const totalRevenuePaise = values.bwRevenuePaise + values.colourRevenuePaise + values.deliveryProfitPaise + values.platformRevenuePaise + values.packingProfitPaise;
  const totalProfitPaise = printingProfitPaise + values.deliveryProfitPaise + values.platformRevenuePaise + values.packingProfitPaise;
  const bharatPrintingSharePaise = Math.round(printingProfitPaise * 0.35);
  const ramyaPrintingSharePaise = printingProfitPaise - bharatPrintingSharePaise;
  const bharatPackingSharePaise = Math.round(values.packingProfitPaise * 0.35);
  return { ...values, bwProfitPaise, colourProfitPaise, printingProfitPaise, totalRevenuePaise, totalProfitPaise, bharatPrintingSharePaise, ramyaPrintingSharePaise, bharatTotalProfitPaise: bharatPrintingSharePaise + values.deliveryProfitPaise + values.platformRevenuePaise + bharatPackingSharePaise };
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { password } = await request.json() as { password?: string };
  if (await sha256(password || "") !== PASSWORD_HASH) return NextResponse.json({ error: "Incorrect ledger password" }, { status: 401 });
  const response = NextResponse.json({ authorized: true });
  response.cookies.set(COOKIE_NAME, ACCESS_TOKEN, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 60 * 60 * 8 });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authorized: false });
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}

export async function GET() {
  if (!(await requireLedgerAccess())) return NextResponse.json({ error: "Ledger password required" }, { status: 401 });
  const result = await database().prepare(`SELECT order_number,customer_name,mobile_number,customer_email,location_name,items_json,printing_subtotal_paise,delivery_fee_paise,platform_fee_paise,packaging_fee_paise,total_paise,status,created_at FROM orders WHERE payment_status='PAID' AND hidden_at IS NULL ORDER BY created_at DESC`).all<any>();
  const days = new Map<string, LedgerValues>();
  const totals = emptyValues();
  for (const order of result.results) {
    const day = String(order.created_at).slice(0, 10);
    const daily = days.get(day) ?? emptyValues();
    daily.orders += 1;
    totals.orders += 1;
    const deliveryProfit = Math.round((Number(order.delivery_fee_paise) || 0) * 0.25);
    const platformRevenue = Number(order.platform_fee_paise) || 0;
    const packingProfit = Number(order.packaging_fee_paise) > 0 ? 170 : 0;
    for (const bucket of [daily, totals]) {
      bucket.deliveryProfitPaise += deliveryProfit;
      bucket.platformRevenuePaise += platformRevenue;
      bucket.packingProfitPaise += packingProfit;
    }
    let items: any[] = [];
    try { const parsed = JSON.parse(order.items_json || "[]"); if (Array.isArray(parsed)) items = parsed; } catch {}
    for (const item of items) { addItem(daily, item); addItem(totals, item); }
    days.set(day, daily);
  }
  return NextResponse.json({
    totals: finish(totals),
    daily: Array.from(days, ([date, values]) => ({ date, ...finish(values) })).sort((a, b) => b.date.localeCompare(a.date)),
    orders: result.results.map(({ items_json, ...order }) => order),
  });
}
