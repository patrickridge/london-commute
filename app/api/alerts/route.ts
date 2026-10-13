import type { PushSubscription } from "web-push";

import type { Commute } from "@/lib/alerts";
import { STATIONS } from "@/lib/network";
import { pushConfigured } from "@/lib/push";
import { find, idFor, MAX_COMMUTES, remove, sameTrip, save, storeConnected } from "@/lib/store";

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

/** Sign this browser up for alerts about a commute, or update the times for one it already has. */
export async function POST(request: Request) {
  if (!pushConfigured()) return Response.json({ error: "Alerts aren't set up on this site yet" }, { status: 503 });
  if (process.env.VERCEL && !storeConnected()) return Response.json({ error: "Alerts aren't set up on this site yet" }, { status: 503 });
  const signup = valid(await request.json().catch(() => null));
  if (!signup) return Response.json({ error: "That isn't a valid commute" }, { status: 400 });
  const id = idFor(signup.subscription.endpoint);
  const others = ((await find(id))?.commutes ?? []).filter((c) => !sameTrip(c, signup.commute));
  if (others.length >= MAX_COMMUTES) return Response.json({ error: `You can have alerts for up to ${MAX_COMMUTES} journeys. Remove one first.` }, { status: 400 });
  const commutes = [...others, { ...signup.commute, lastSent: null }];
  await save({ id, subscription: signup.subscription, commutes });
  return Response.json({ commutes: commutes.map(({ from, to, time, days, mode }) => ({ from, to, time, days, mode })) });
}

/** Stop alerts for one journey, given `from` and `to`, or for all of them. */
export async function DELETE(request: Request) {
  const { endpoint, from, to } = ((await request.json().catch(() => null)) ?? {}) as { endpoint?: string; from?: string; to?: string };
  if (!endpoint) return Response.json({ error: "Missing endpoint" }, { status: 400 });
  const id = idFor(endpoint);
  const subscriber = await find(id);
  const left = from && to && subscriber ? subscriber.commutes.filter((c) => !(c.from === from && c.to === to)) : [];
  if (left.length && subscriber) await save({ ...subscriber, commutes: left });
  else await remove(id);
  return Response.json({ ok: true });
}
