import { NextResponse } from "next/server";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in to apply for a franchise" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const fullName = String(body?.fullName ?? "").trim();
  const location = String(body?.location ?? "").trim();
  const mobileNumber = String(body?.mobileNumber ?? "").replace(/\D/g, "");
  const whatsappNumber = String(body?.whatsappNumber ?? "").replace(/\D/g, "");
  const address = String(body?.address ?? "").trim();
  if (!fullName || !location || mobileNumber.length !== 10 || whatsappNumber.length !== 10 || !address) return NextResponse.json({ error: "Complete all application details with valid 10-digit mobile and WhatsApp numbers" }, { status: 400 });
  const now = new Date().toISOString();
  await database().prepare("INSERT INTO franchise_applications (id,full_name,location,mobile_number,email,whatsapp_number,address,fee_paise,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), fullName, location, mobileNumber, viewer.email, whatsappNumber, address, 6000000, "SUBMITTED", now, now).run();
  return NextResponse.json({ submitted: true });
}
