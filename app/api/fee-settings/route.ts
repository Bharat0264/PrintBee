import { NextResponse } from "next/server";
import { database } from "../db";
import { getViewer } from "../../supabase/server";

const rupees = (paise: unknown, fallback: number) => {
  const value = Number(paise);
  return (Number.isFinite(value) ? Math.max(0, value) : fallback) / 100;
};

export async function GET() {
  const [row, viewer] = await Promise.all([database().prepare("SELECT gateway_enabled,surge_enabled,surge_type,surge_value,late_night_enabled,late_night_type,late_night_value,platform_fee_paise,delivery_base_fee_paise,delivery_fee_per_100m_paise,packaging_enabled,packaging_fee_paise FROM checkout_fee_settings WHERE id='main'").first<any>(), getViewer()]);
  return NextResponse.json({ ...(viewer?.isAdmin ? { gatewayEnabled: row?.gateway_enabled !== 0 } : {}), surgeEnabled: Boolean(row?.surge_enabled), surgeType: row?.surge_type ?? "PERCENT", surgeValue: Number(row?.surge_value) || 0, lateNightEnabled: Boolean(row?.late_night_enabled), lateNightType: row?.late_night_type ?? "PERCENT", lateNightValue: Number(row?.late_night_value) || 0, platformFee: rupees(row?.platform_fee_paise, 350), baseDeliveryFee: rupees(row?.delivery_base_fee_paise, 1000), deliveryFeePer100Meters: rupees(row?.delivery_fee_per_100m_paise, 100), packagingEnabled: Boolean(row?.packaging_enabled), packagingFee: rupees(row?.packaging_fee_paise, 0) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const body = await request.json() as any;
  const type = body.surgeType === "FIXED" ? "FIXED" : "PERCENT";
  const value = Number(body.surgeValue); const lateNightType = body.lateNightType === "FIXED" ? "FIXED" : "PERCENT"; const lateNightValue = Number(body.lateNightValue);
  const platformFee = Number(body.platformFee); const baseDeliveryFee = Number(body.baseDeliveryFee); const deliveryFeePer100Meters = Number(body.deliveryFeePer100Meters); const packagingFee = Number(body.packagingFee);
  if (!Number.isFinite(value) || value < 0 || (type === "PERCENT" && value > 100)) return NextResponse.json({ error: "Enter a valid surge value" }, { status: 400 });
  if (!Number.isFinite(lateNightValue) || lateNightValue < 0 || (lateNightType === "PERCENT" && lateNightValue > 100)) return NextResponse.json({ error: "Enter a valid late-night delivery fee" }, { status: 400 });
  if (![platformFee, baseDeliveryFee, deliveryFeePer100Meters, packagingFee].every((fee) => Number.isFinite(fee) && fee >= 0)) return NextResponse.json({ error: "Enter valid platform and delivery fees" }, { status: 400 });
  const platformFeePaise = Math.round(platformFee * 100); const baseDeliveryFeePaise = Math.round(baseDeliveryFee * 100); const deliveryFeePer100MetersPaise = Math.round(deliveryFeePer100Meters * 100); const packagingFeePaise = Math.round(packagingFee * 100);
  await database().prepare("INSERT INTO checkout_fee_settings (id,gateway_enabled,surge_enabled,surge_type,surge_value,late_night_enabled,late_night_type,late_night_value,platform_fee_paise,delivery_base_fee_paise,delivery_fee_per_100m_paise,packaging_enabled,packaging_fee_paise,updated_at,updated_by) VALUES ('main',?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET gateway_enabled=excluded.gateway_enabled,surge_enabled=excluded.surge_enabled,surge_type=excluded.surge_type,surge_value=excluded.surge_value,late_night_enabled=excluded.late_night_enabled,late_night_type=excluded.late_night_type,late_night_value=excluded.late_night_value,platform_fee_paise=excluded.platform_fee_paise,delivery_base_fee_paise=excluded.delivery_base_fee_paise,delivery_fee_per_100m_paise=excluded.delivery_fee_per_100m_paise,packaging_enabled=excluded.packaging_enabled,packaging_fee_paise=excluded.packaging_fee_paise,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(body.gatewayEnabled ? 1 : 0, body.surgeEnabled ? 1 : 0, type, value, body.lateNightEnabled ? 1 : 0, lateNightType, lateNightValue, platformFeePaise, baseDeliveryFeePaise, deliveryFeePer100MetersPaise, body.packagingEnabled ? 1 : 0, packagingFeePaise, new Date().toISOString(), viewer.email).run();
  return NextResponse.json({ gatewayEnabled: Boolean(body.gatewayEnabled), surgeEnabled: Boolean(body.surgeEnabled), surgeType: type, surgeValue: value, lateNightEnabled: Boolean(body.lateNightEnabled), lateNightType, lateNightValue, platformFee: platformFeePaise / 100, baseDeliveryFee: baseDeliveryFeePaise / 100, deliveryFeePer100Meters: deliveryFeePer100MetersPaise / 100, packagingEnabled: Boolean(body.packagingEnabled), packagingFee: packagingFeePaise / 100 });
}
