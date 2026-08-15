import { NextResponse } from "next/server";
import { database } from "../db";
import { getViewer } from "../../supabase/server";

const PRICE_IDS = ["bw-single", "bw-double", "colour-single", "colour-double"] as const;
const DEFAULT_PRICES = { "bw-single": 200, "bw-double": 300, "colour-single": 800, "colour-double": 1400 };

export async function GET() {
  const rows = await database().prepare("SELECT id, price_paise FROM print_prices").all<{ id: string; price_paise: number }>();
  const prices = { ...DEFAULT_PRICES };
  for (const row of rows.results) {
    if (PRICE_IDS.includes(row.id as (typeof PRICE_IDS)[number])) prices[row.id as keyof typeof prices] = row.price_paise;
  }
  return NextResponse.json(prices, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin || !["OWNER", "OPERATIONS"].includes(viewer.adminRole || "")) return NextResponse.json({ error: "Operations access required" }, { status: 403 });
  const body = await request.json() as Partial<Record<(typeof PRICE_IDS)[number], number>>;
  const values = PRICE_IDS.map((id) => Math.round(Number(body[id]) * 100));
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    return NextResponse.json({ error: "Enter a valid price for every print type" }, { status: 400 });
  }
  const db = database();
  await db.batch(PRICE_IDS.map((id, index) => db.prepare("INSERT INTO print_prices (id,price_paise,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET price_paise=excluded.price_paise,updated_at=excluded.updated_at").bind(id, values[index], new Date().toISOString())));
  return NextResponse.json(Object.fromEntries(PRICE_IDS.map((id, index) => [id, values[index]])), { headers: { "Cache-Control": "no-store" } });
}
