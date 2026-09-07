import { NextResponse } from "next/server";
import { database } from "../db";

export async function GET() {
  const rows = await database().prepare("SELECT 'main' AS id, COALESCE(NULLIF(name, ''), 'PrintBee SRM University') AS name, 4000 AS radius_meters FROM store_location WHERE id='main' UNION ALL SELECT id,name,radius_meters FROM franchise_stores WHERE active=1 ORDER BY name").all<{ id: string; name: string; radius_meters: number }>();
  return NextResponse.json(rows.results);
}
