import { NextResponse } from "next/server";
import { database } from "../../db";
import { calculateDeliveryFeePaise, calculateDistanceMeters, readCoordinates } from "../fees";

export async function POST(request: Request) {
  const customer = readCoordinates(await request.json().catch(() => null));
  if (!customer) return NextResponse.json({ error: "A valid current location is required" }, { status: 400 });
  const store = await database().prepare("SELECT latitude,longitude FROM store_location WHERE id='main'").first<{ latitude: number; longitude: number }>();
  const storeCoordinates = readCoordinates(store);
  if (!storeCoordinates) return NextResponse.json({ error: "Delivery is temporarily unavailable" }, { status: 503 });
  const distanceMeters = calculateDistanceMeters(storeCoordinates, customer);
  return NextResponse.json({ deliveryFee: calculateDeliveryFeePaise(distanceMeters) / 100 });
}
