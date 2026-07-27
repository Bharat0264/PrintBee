import PrintBeeApp from "./PrintBeeApp";
import { getViewer } from "./supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const viewer = await getViewer();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseConfig = supabaseUrl && supabaseAnonKey
    ? { url: supabaseUrl, anonKey: supabaseAnonKey }
    : null;

  return <PrintBeeApp viewer={viewer} supabaseConfig={supabaseConfig} />;
}
