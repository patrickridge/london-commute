import { compose, londonTime } from "@/lib/alerts";
import { LINE_IDS } from "@/lib/lines";
import { linksFor } from "@/lib/network";
import { send } from "@/lib/push";
import { plan, timeToSlot } from "@/lib/seats";
import { find, idFor, remove } from "@/lib/store";
import { getLineStatus } from "@/lib/tfl";

/** Send this browser the alert for one of its journeys right now, so it can check notifications work. */
export async function POST(request: Request) {
  const { endpoint, from, to } = ((await request.json().catch(() => null)) ?? {}) as { endpoint?: string; from?: string; to?: string };
  const subscriber = endpoint ? await find(idFor(endpoint)) : null;
  const commute = subscriber?.commutes.find((c) => c.from === from && c.to === to) ?? subscriber?.commutes[0];
  if (!subscriber || !commute) return Response.json({ error: "Turn alerts on first" }, { status: 404 });

  const links = linksFor(londonTime(new Date()).weekday);
  const legs = plan(links, commute.from, commute.to, timeToSlot(...(commute.time.split(":").map(Number) as [number, number])));
  const ids = [...new Set((legs ?? []).flatMap((leg) => LINE_IDS[leg.line] ?? []))];
  const status = ids.length ? await getLineStatus(ids.sort()).catch(() => []) : [];
  const alert = compose(commute, links, status, { force: true })!;
  const result = await send(subscriber.subscription, { ...alert, title: `Test: ${alert.title}` });
  if (result === "gone") await remove(subscriber.id);
  return Response.json({ result });
}
