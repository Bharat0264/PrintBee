import { NextResponse } from "next/server";
import { database } from "../db";
import { getViewer } from "../../supabase/server";

const categories = new Set(["AI","Machine Learning","Data Science","Web Development","Mobile Development","IoT","Cybersecurity","Cloud","Blockchain","Big Data","Electronics","Robotics","Other"]);
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72);
const listFields = "id,title,slug,category,short_description,tech_stack_json,difficulty,final_price_paise,thumbnail_key,demo_url,verified,published_at";

export async function GET(request: Request) {
  const url = new URL(request.url); const category = url.searchParams.get("category"); const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80); const sort = url.searchParams.get("sort");
  const order = sort === "price_asc" ? "final_price_paise ASC" : sort === "price_desc" ? "final_price_paise DESC" : "published_at DESC";
  const filters = ["status='PUBLISHED'"]; const values: string[] = [];
  if (category && categories.has(category)) { filters.push("category=?"); values.push(category); }
  if (q) { filters.push("(title LIKE ? OR short_description LIKE ? OR tech_stack_json LIKE ?)"); values.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await database().prepare(`SELECT ${listFields} FROM projects WHERE ${filters.join(" AND ")} ORDER BY ${order} LIMIT 60`).bind(...values).all<any>();
  return NextResponse.json({ projects: rows.results });
}

export async function POST(request: Request) {
  const viewer = await getViewer(); if (!viewer) return NextResponse.json({ error: "Sign in to submit a project" }, { status: 401 });
  const body = await request.json() as any; const title = String(body.title ?? "").trim(); const category = String(body.category ?? ""); const shortDescription = String(body.shortDescription ?? "").trim(); const requested = Number(body.requestedPrice);
  const sellerName=String(body.sellerName??"").trim(), sellerMobile=String(body.sellerMobile??"").replace(/\D/g,""), sellerWhatsapp=String(body.sellerWhatsapp??"").replace(/\D/g,""), sellerUpi=String(body.sellerUpi??"").trim();
  if (title.length < 3 || title.length > 140 || !categories.has(category) || shortDescription.length < 20 || shortDescription.length > 360 || !Number.isFinite(requested) || requested < 0 || requested > 1_000_000 || sellerName.length<2 || sellerMobile.length<10 || sellerWhatsapp.length<10 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(viewer.email) || sellerUpi.length<3 || body.ownershipConfirmed !== true) return NextResponse.json({ error: "Add your name, mobile, WhatsApp and UPI details, then complete the ownership declaration" }, { status: 400 });
  const id = crypto.randomUUID(), projectCode=`PB-${id.replace(/-/g,"").slice(0,8).toUpperCase()}`; const now = new Date().toISOString(); const base = slugify(title) || "project"; let slug = base; let suffix = 2;
  while (await database().prepare("SELECT 1 FROM projects WHERE slug=?").bind(slug).first()) slug = `${base}-${suffix++}`;
  const features = Array.isArray(body.features) ? body.features.map(String).map((v) => v.trim()).filter(Boolean).slice(0, 20) : []; const tech = Array.isArray(body.techStack) ? body.techStack.map(String).map((v) => v.trim()).filter(Boolean).slice(0, 20) : [];
  await database().batch([database().prepare("INSERT INTO projects (id,project_code,seller_email,seller_name,seller_mobile,seller_whatsapp,seller_upi_id,title,slug,category,short_description,problem_statement,abstract,description,features_json,tech_stack_json,difficulty,requested_price_paise,files_json,demo_url,status,ownership_confirmed,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,projectCode,viewer.email,sellerName,sellerMobile,sellerWhatsapp,sellerUpi,title,slug,category,shortDescription,String(body.problemStatement ?? "").slice(0,3000),String(body.abstract ?? "").slice(0,3000),String(body.description ?? "").slice(0,12000),JSON.stringify(features),JSON.stringify(tech),String(body.difficulty ?? "").slice(0,40),Math.round(requested*100),JSON.stringify([]),String(body.demoUrl ?? "").slice(0,500),"PENDING_REVIEW",1,now,now), database().prepare("INSERT INTO project_audit_log (id,project_id,actor_email,action,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),id,viewer.email,"SUBMITTED",now)]);
  return NextResponse.json({ id, projectCode, slug, status: "PENDING_REVIEW" }, { status: 201 });
}
