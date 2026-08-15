import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";

const allowed = new Set(["REQUESTED", "IN_PROGRESS", "SENT"]);

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin || !["OWNER", "ACCOUNTANT"].includes(viewer.adminRole || "")) return NextResponse.json({ error: "Accounting access required" }, { status: 403 });
  const { withdrawalId, status } = await request.json() as { withdrawalId?: string; status?: string };
  if (!withdrawalId || !status || !allowed.has(status)) return NextResponse.json({ error: "Valid withdrawal and status are required" }, { status: 400 });
  const result = await database().prepare("UPDATE rider_withdrawals SET status=?, updated_at=?, updated_by=? WHERE id=?").bind(status, new Date().toISOString(), viewer.email, withdrawalId).run();
  if (!result.meta.changes) return NextResponse.json({ error: "Withdrawal request not found" }, { status: 404 });
  return NextResponse.json({ updated: true });
}
