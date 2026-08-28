import PrintBeeApp from "./PrintBeeApp";
import { getViewer } from "./supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const host = (await headers()).get("host")?.split(":")[0]?.toLowerCase();
  if (host === "printbee-a4-printing.bharathsaipulipati.chatgpt.site") redirect("https://www.printbee.co.in");
  const viewer = await getViewer();
  const appwriteConfigured = Boolean(
    process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT
    && process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
    && process.env.APPWRITE_API_KEY,
  );

  return <PrintBeeApp viewer={viewer} appwriteConfigured={appwriteConfigured} />;
}
