import webpush from "web-push";
import { database } from "../db";

export async function sendPushToEmail(email: string, payload: { title: string; body: string; tag: string; url?: string }) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return;
  webpush.setVapidDetails("mailto:printbee.co.in@gmail.com", publicKey, privateKey);
  const db = database();
  const subscriptions = await db.prepare("SELECT id,subscription_json FROM push_subscriptions WHERE email=?").bind(email.toLowerCase()).all<{ id: string; subscription_json: string }>();
  await Promise.all(subscriptions.results.map(async (row) => {
    try { await webpush.sendNotification(JSON.parse(row.subscription_json), JSON.stringify(payload), { TTL: 3600 }); }
    catch (error: any) { if ([404, 410].includes(error?.statusCode)) await db.prepare("DELETE FROM push_subscriptions WHERE id=?").bind(row.id).run(); }
  }));
}

export async function sendPushToAdmins(payload: { title: string; body: string; tag: string; url?: string }) {
  const rows = await database().prepare("SELECT email FROM admin_members WHERE role IN ('OWNER','OPERATIONS','SUPPORT')").all<{ email: string }>();
  await Promise.all(rows.results.map((row) => sendPushToEmail(row.email, payload)));
}
