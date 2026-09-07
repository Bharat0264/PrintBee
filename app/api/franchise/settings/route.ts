import { NextResponse } from "next/server";
import { database } from "../../db";
import { franchiseAccess, canOperateStore } from "../access";

export async function GET() {
  const access = await franchiseAccess();
  if (!access.viewer || (!access.viewer.isAdmin && !access.storeIds?.length)) return NextResponse.json({ error: "Franchise access required" }, { status: 403 });
  const query = access.viewer.isAdmin ? "SELECT * FROM franchise_settings" : "SELECT * FROM franchise_settings WHERE store_id IN (SELECT store_id FROM franchise_members WHERE lower(email)=?)";
  const rows = access.viewer.isAdmin ? await database().prepare(query).all() : await database().prepare(query).bind(access.viewer.email.toLowerCase()).all();
  return NextResponse.json(rows.results);
}

export async function POST(request: Request) {
  const access = await franchiseAccess(); const body = await request.json().catch(() => null);
  if (!access.viewer || !body?.storeId || !canOperateStore(access, body.storeId)) return NextResponse.json({ error: "Store access required" }, { status: 403 });
  const values = ["bwSinglePaise","bwDoublePaise","colourSinglePaise","colourDoublePaise","deliveryBaseFeePaise","deliveryFeePer100mPaise"].map((key) => Math.round(Number(body[key])));
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return NextResponse.json({ error: "Enter valid non-negative store prices and delivery fees" }, { status: 400 });
  await database().prepare("UPDATE franchise_settings SET bw_single_paise=?,bw_double_paise=?,colour_single_paise=?,colour_double_paise=?,platform_fee_paise=150,delivery_base_fee_paise=?,delivery_fee_per_100m_paise=?,updated_at=?,updated_by=? WHERE store_id=?").bind(...values.slice(0,4), values[4], values[5], new Date().toISOString(), access.viewer.email, body.storeId).run();
  return NextResponse.json({ saved: true, platformFeePaise: 150, gatewayFeePercent: 1 });
}
