import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Email and password sign-in is disabled. Continue with Google instead." }, { status: 410 });
}
