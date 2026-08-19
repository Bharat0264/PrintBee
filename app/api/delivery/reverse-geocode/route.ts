import { NextResponse } from "next/server";
import { readCoordinates } from "../fees";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const coordinates = readCoordinates({ latitude: Number(url.searchParams.get("latitude")), longitude: Number(url.searchParams.get("longitude")) });
  if (!coordinates) return NextResponse.json({ error: "A valid location is required" }, { status: 400 });
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${encodeURIComponent(String(coordinates.latitude))}&lon=${encodeURIComponent(String(coordinates.longitude))}`, { headers: { "Accept-Language": "en", "User-Agent": "PrintBee delivery address lookup" } });
    const data = await response.json().catch(() => null) as { display_name?: string } | null;
    if (!response.ok || !data?.display_name) throw new Error("Address unavailable");
    return NextResponse.json({ address: data.display_name });
  } catch {
    return NextResponse.json({ error: "We could not find an address for this point" }, { status: 502 });
  }
}
