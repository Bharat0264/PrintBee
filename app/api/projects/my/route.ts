import { NextResponse } from "next/server";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";
export async function GET() { const viewer = await getViewer(); if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 }); const rows = await database().prepare("SELECT id,title,slug,category,short_description,requested_price_paise,proposed_price_paise,final_price_paise,status,verified,seller_message,created_at,updated_at FROM projects WHERE seller_email=? ORDER BY updated_at DESC").bind(viewer.email).all(); return NextResponse.json({ projects: rows.results }); }
