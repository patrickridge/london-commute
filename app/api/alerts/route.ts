import type { PushSubscription } from "web-push";

import type { Commute } from "@/lib/alerts";
import { STATIONS } from "@/lib/network";
import { pushConfigured } from "@/lib/push";
import { idFor, remove, save, storeConnected } from "@/lib/store";

function valid(body: unknown): { subscription: PushSubscription; commute: Commute } | null {
  const { subscription, commute } = (body ?? {}) as { subscription?: PushSubscription; commute?: Commute };
  if (!subscription?.endpoint?.startsWith("https://") || !subscription.keys?.p256dh || !subscription.keys?.auth) return null;
  if (!commute || !STATIONS[commute.from] || !STATIONS[commute.to] || commute.from === commute.to) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(commute.time)) return null;
  if (!Array.isArray(commute.days) || !commute.days.length || commute.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return null;
  if (commute.mode !== "issues" && commute.mode !== "daily") return null;
  const { from, to, time, days, mode } = commute;
  return { subscription: { endpoint: subscription.endpoint, keys: subscription.keys }, commute: { from, to, time, days: [...new Set(days)].sort(), mode } };
}

/** Sign up (or update) this browser for alerts about a commute. */
export async function POST(request: Request) {
  if (!pushConfigured()) return Response.json({ error: "Alerts aren't set up on this site yet" }, { status: 503 });
  if (process.env.VERCEL && !storeConnected()) return Response.json({ error: "Alerts aren't set up on this site yet" }, { status: 503 });
  const signup = valid(await request.json().catch(() => null));
  if (!signup) return Response.json({ error: "That isn't a valid commute" }, { status: 400 });
  const id = idFor(signup.subscription.endpoint);
  await save({ id, ...signup, lastSent: null });
  return Response.json({ id });
}

/** Stop alerts for this browser. */
export async function DELETE(request: Request) {
  const { endpoint } = ((await request.json().catch(() => null)) ?? {}) as { endpoint?: string };
  if (!endpoint) return Response.json({ error: "Missing endpoint" }, { status: 400 });
  await remove(idFor(endpoint));
  return Response.json({ ok: true });
}
