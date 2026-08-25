import { NextResponse } from "next/server";
import { mongoDb } from "../../../lib/mongodb";
import { getViewer } from "../../supabase/server";

export async function GET() {
  const rows = await mongoDb().collection("locations").find({ active: { $in: [true, 1] } }, { projection: { _id: 0, id: 1, name: 1, delivery_fee_paise: 1, platform_fee_paise: 1 } }).sort({ name: 1 }).toArray();
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { name } = await request.json() as { name?: string };
  const cleanName = name?.trim();
  if (!cleanName) return NextResponse.json({ error: "Location name is required" }, { status: 400 });
  const id = crypto.randomUUID();
  await mongoDb().collection("locations").insertOne({ id, name: cleanName, active: true, created_at: new Date().toISOString(), delivery_fee_paise: 1500, platform_fee_paise: 350 });
  return NextResponse.json({ id, name: cleanName });
}
