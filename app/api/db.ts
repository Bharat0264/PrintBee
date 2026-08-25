import { mongoDb } from "../../lib/mongodb";
import { r2 } from "../../lib/r2";

type LegacyStatement = {
  bind(...values: unknown[]): LegacyStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
};
type LegacyDb = { prepare(sql: string): LegacyStatement; batch(statements: LegacyStatement[]): Promise<Array<{ meta: { changes: number } }>>; };

/** @deprecated Routes must use mongoDb() collections directly. */
export function database(): LegacyDb {
  return mongoDb() as unknown as LegacyDb;
}

/** @deprecated Routes must use the R2 S3 client directly. */
export function fileBucket(): any {
  return r2;
}

export async function hashDeliveryCode(orderId: string, code: string) {
  const bytes = new TextEncoder().encode(`${orderId}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function encryptionKey() {
  const secret = process.env.DELIVERY_CODE_SECRET;
  if (!secret) throw new Error("Delivery-code encryption is unavailable");
  return crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptDeliveryCode(code: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(code));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(encrypted)))}`;
}

export async function decryptDeliveryCode(value: string) {
  const [ivPart, dataPart] = value.split(".");
  const iv = Uint8Array.from(atob(ivPart), (char) => char.charCodeAt(0));
  const data = Uint8Array.from(atob(dataPart), (char) => char.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await encryptionKey(), data);
  return new TextDecoder().decode(decrypted);
}
