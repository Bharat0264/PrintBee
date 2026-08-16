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
  addonRevenuePaise: number;
  packagingOrders: number;
  amountCollectedPaise: number;
  printingCollectedPaise: number;
  deliveryCollectedPaise: number;
  platformCollectedPaise: number;
  packagingCollectedPaise: number;
  gatewayCollectedPaise: number;
  surgeCollectedPaise: number;
  lateNightCollectedPaise: number;
  pointsDiscountPaise: number;
  riderCostPaise: number;
};

function emptyValues(): LedgerValues {
  return { orders: 0, bwPages: 0, bwRevenuePaise: 0, bwCostPaise: 0, colourPages: 0, colourRevenuePaise: 0, colourCostPaise: 0, addonRevenuePaise: 0, packagingOrders: 0, amountCollectedPaise: 0, printingCollectedPaise: 0, deliveryCollectedPaise: 0, platformCollectedPaise: 0, packagingCollectedPaise: 0, gatewayCollectedPaise: 0, surgeCollectedPaise: 0, lateNightCollectedPaise: 0, pointsDiscountPaise: 0, riderCostPaise: 0 };
}

function addItem(values: LedgerValues, item: any) {
  if (item?.kind === "ADDON") {
    values.addonRevenuePaise += Math.round((Number(item?.total ?? item?.addonsTotal) || 0) * 100);
    return;
  }
  values.addonRevenuePaise += Math.round((Number(item?.addonsTotal) || 0) * 100);
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
  const printingRevenuePaise = values.bwRevenuePaise + values.colourRevenuePaise;
  const serviceRevenuePaise = values.printingCollectedPaise - printingRevenuePaise - values.addonRevenuePaise;
  const printingOperationalCostPaise = values.bwCostPaise + values.colourCostPaise;
  const printingProfitPaise = printingRevenuePaise - printingOperationalCostPaise;
  const deliveryProfitPaise = values.deliveryCollectedPaise - values.riderCostPaise;
  const packagingProfitPaise = Math.min(values.packagingCollectedPaise, values.packagingOrders * 170);
  const packagingCostPaise = values.packagingCollectedPaise - packagingProfitPaise;
  const operationalCostPaise = printingOperationalCostPaise + values.riderCostPaise + packagingCostPaise + values.gatewayCollectedPaise;
  const netProfitPaise = values.amountCollectedPaise - operationalCostPaise;
  const sharedProfitPaise = printingProfitPaise + serviceRevenuePaise + values.addonRevenuePaise;
  const bharatSharedProfitPaise = Math.round(sharedProfitPaise * 0.35);
  const ramyaSharedProfitPaise = sharedProfitPaise - bharatSharedProfitPaise;
  const adminDirectProfitPaise = deliveryProfitPaise + values.platformCollectedPaise + values.surgeCollectedPaise + values.lateNightCollectedPaise - values.pointsDiscountPaise;
  const bharatPackingProfitPaise = packagingProfitPaise;
  const bharatTotalProfitPaise = bharatSharedProfitPaise + bharatPackingProfitPaise + adminDirectProfitPaise;
  const ramyaTotalProfitPaise = ramyaSharedProfitPaise;
  return { ...values, bwProfitPaise, colourProfitPaise, printingRevenuePaise, serviceRevenuePaise, printingOperationalCostPaise, printingProfitPaise, addonProfitPaise: values.addonRevenuePaise, deliveryProfitPaise, packagingCostPaise, packagingProfitPaise, operationalCostPaise, netProfitPaise, sharedProfitPaise, bharatSharedProfitPaise, ramyaSharedProfitPaise, adminDirectProfitPaise, bharatPackingProfitPaise, bharatTotalProfitPaise, ramyaTotalProfitPaise, shareTallyPaise: bharatTotalProfitPaise + ramyaTotalProfitPaise };
}

function addValues(target: LedgerValues, source: LedgerValues) {
  for (const key of Object.keys(target) as Array<keyof LedgerValues>) target[key] += source[key];
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { password } = await request.json() as { password?: string };
  if (await sha256(password || "") !== PASSWORD_HASH) return NextResponse.json({ error: "Incorrect ledger password" }, { status: 401 });
  const response = NextResponse.json({ authorized: true });
  response.cookies.set(COOKIE_NAME, ACCESS_TOKEN, { httpOnly: true, secure: true, sameSite: "strict", path: "/" });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authorized: false });
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}

export async function GET() {
  if (!(await requireLedgerAccess())) return NextResponse.json({ error: "Ledger password required" }, { status: 401 });
  const result = await database().prepare(`SELECT order_number,customer_name,mobile_number,customer_email,location_name,items_json,printing_subtotal_paise,delivery_fee_paise,platform_fee_paise,packaging_fee_paise,payment_gateway_fee_paise,surge_fee_paise,late_night_fee_paise,points_discount_paise,total_paise,status,created_at FROM orders WHERE payment_status='PAID' AND hidden_at IS NULL ORDER BY created_at DESC`).all<any>();
  const days = new Map<string, LedgerValues>();
  const totals = emptyValues();
  const orderBreakdowns: any[] = [];
  for (const order of result.results) {
    const day = String(order.created_at).slice(0, 10);
    const daily = days.get(day) ?? emptyValues();
    const values = emptyValues();
    values.orders = 1;
    values.amountCollectedPaise = Number(order.total_paise) || 0;
    values.printingCollectedPaise = Number(order.printing_subtotal_paise) || 0;
    values.deliveryCollectedPaise = Number(order.delivery_fee_paise) || 0;
    values.platformCollectedPaise = Number(order.platform_fee_paise) || 0;
    values.packagingCollectedPaise = Number(order.packaging_fee_paise) || 0;
    values.packagingOrders = values.packagingCollectedPaise > 0 ? 1 : 0;
    values.gatewayCollectedPaise = Number(order.payment_gateway_fee_paise) || 0;
    values.surgeCollectedPaise = Number(order.surge_fee_paise) || 0;
    values.lateNightCollectedPaise = Number(order.late_night_fee_paise) || 0;
    values.pointsDiscountPaise = Number(order.points_discount_paise) || 0;
    values.riderCostPaise = Math.floor(values.deliveryCollectedPaise * 0.75);
    let items: any[] = [];
    try { const parsed = JSON.parse(order.items_json || "[]"); if (Array.isArray(parsed)) items = parsed; } catch {}
    for (const item of items) addItem(values, item);
    addValues(daily, values);
    addValues(totals, values);
    days.set(day, daily);
    orderBreakdowns.push({ ...order, ...finish(values) });
  }
  return NextResponse.json({
    totals: finish(totals),
    daily: Array.from(days, ([date, values]) => ({ date, ...finish(values) })).sort((a, b) => b.date.localeCompare(a.date)),
    orders: orderBreakdowns.map(({ items_json, ...order }) => order),
  });
}
