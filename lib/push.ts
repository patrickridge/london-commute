// Sending a notification to a browser with the Web Push protocol. Needs a VAPID key pair (generate
// one with `npx web-push generate-vapid-keys`) in NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.

import webpush, { type PushSubscription, WebPushError } from "web-push";

import type { Alert } from "./alerts";

let ready = false;

export const pushConfigured = () => Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

function setUp() {
  if (ready) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:alerts@london-commute-planner.vercel.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  ready = true;
}

/** "gone" means the browser has unsubscribed or the subscription expired, so it should be forgotten. */
export async function send(subscription: PushSubscription, alert: Alert): Promise<"sent" | "gone" | "failed"> {
  setUp();
  try {
    await webpush.sendNotification(subscription, JSON.stringify(alert), { TTL: 30 * 60, urgency: "high" });
    return "sent";
  } catch (error) {
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) return "gone";
    return "failed";
  }
}
