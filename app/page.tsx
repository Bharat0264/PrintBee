import PrintBeeApp from "./PrintBeeApp";
import { getViewer } from "./supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const host = (await headers()).get("host")?.split(":")[0]?.toLowerCase();
  if (host === "printbee-a4-printing.bharathsaipulipati.chatgpt.site") redirect("https://www.printbee.co.in");
  const viewer = await getViewer();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseConfig = supabaseUrl && supabaseAnonKey
    ? { url: supabaseUrl, anonKey: supabaseAnonKey }
    : null;

  return <PrintBeeApp viewer={viewer} supabaseConfig={supabaseConfig} />;
}
