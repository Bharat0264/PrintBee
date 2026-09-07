import { database } from "../db";
import { getViewer } from "../../supabase/server";

export async function franchiseAccess() {
  const viewer = await getViewer();
  if (!viewer) return { viewer: null, storeIds: [] as string[] };
  if (viewer.isAdmin) return { viewer, storeIds: null as string[] | null };
  const rows = await database().prepare("SELECT store_id FROM franchise_members WHERE lower(email)=?").bind(viewer.email.toLowerCase()).all<{ store_id: string }>();
  return { viewer, storeIds: rows.results.map((row) => row.store_id) };
}

export function canOperateStore(access: Awaited<ReturnType<typeof franchiseAccess>>, storeId: string | null | undefined) {
  return Boolean(access.viewer?.isAdmin || (storeId && access.storeIds?.includes(storeId)));
}
