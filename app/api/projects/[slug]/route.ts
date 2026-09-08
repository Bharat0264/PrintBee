import { NextResponse } from "next/server";
import { database } from "../../db";
export async function GET(_:Request,{params}:{params:Promise<{slug:string}>}){const {slug}=await params;const project=await database().prepare("SELECT id,title,slug,category,short_description,problem_statement,abstract,description,features_json,tech_stack_json,difficulty,final_price_paise,thumbnail_key,demo_url,verified,published_at FROM projects WHERE slug=? AND status='PUBLISHED'").bind(slug).first();return project?NextResponse.json({project}):NextResponse.json({error:"Project not found"},{status:404});}
