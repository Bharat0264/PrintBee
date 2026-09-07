import { NextResponse } from "next/server";
import { database } from "../db";

export async function GET() {
  const rows = await database().prepare("SELECT id,name,radius_meters FROM franchise_stores WHERE active=1 ORDER BY name").all<{ id: string; name: string; radius_meters: number }>();
  return NextResponse.json(rows.results);
}
