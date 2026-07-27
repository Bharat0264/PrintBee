import { env } from "cloudflare:workers";

export function database() {
  if (!env.DB) throw new Error("Database is unavailable");
  return env.DB;
}

export async function hashDeliveryCode(orderId: string, code: string) {
  const bytes = new TextEncoder().encode(`${orderId}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
