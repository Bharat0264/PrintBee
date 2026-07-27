import PrintBeeApp from "./PrintBeeApp";
import { getViewer } from "./supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const viewer = await getViewer();
  const authConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return <PrintBeeApp viewer={viewer} authConfigured={authConfigured} />;
}
