import { NextResponse } from "next/server";
import { database } from "../../db";
import { calculateDeliveryFeePaise, calculateDistanceMeters, MAX_DELIVERY_DISTANCE_METERS, readCoordinates } from "../fees";

export async function POST(request: Request) {
  const customer = readCoordinates(await request.json().catch(() => null));
  if (!customer) return NextResponse.json({ error: "A valid current location is required" }, { status: 400 });
  const store = await database().prepare("SELECT latitude,longitude FROM store_location WHERE id='main'").first<{ latitude: number; longitude: number }>();
  const storeCoordinates = readCoordinates(store);
  if (!storeCoordinates) return NextResponse.json({ error: "Delivery is temporarily unavailable" }, { status: 503 });
  const distanceMeters = calculateDistanceMeters(storeCoordinates, customer);
  if (distanceMeters > MAX_DELIVERY_DISTANCE_METERS) return NextResponse.json({ error: "We are unable to deliver to this location. Delivery is available within 4 km of the store." }, { status: 422 });
  const settings = await database().prepare("SELECT delivery_base_fee_paise,delivery_fee_per_100m_paise FROM checkout_fee_settings WHERE id='main'").first<any>();
  const baseFee = Number(settings?.delivery_base_fee_paise);
  const per100MetersFee = Number(settings?.delivery_fee_per_100m_paise);
  return NextResponse.json({ deliveryFee: calculateDeliveryFeePaise(distanceMeters, Number.isFinite(baseFee) ? baseFee : 1000, Number.isFinite(per100MetersFee) ? per100MetersFee : 100) / 100 });
}
