import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { locationId, deliveryFee, platformFee } = await request.json() as { locationId?: string; deliveryFee?: number; platformFee?: number };
  const deliveryFeePaise = Math.round(Number(deliveryFee) * 100);
  const platformFeePaise = Math.round(Number(platformFee) * 100);
  if (!locationId || deliveryFeePaise < 0 || platformFeePaise < 0) return NextResponse.json({ error: "Enter valid non-negative fees" }, { status: 400 });
  await database().prepare("UPDATE locations SET delivery_fee_paise=?, platform_fee_paise=? WHERE id=?").bind(deliveryFeePaise, platformFeePaise, locationId).run();
  return NextResponse.json({ updated: true });
}
