import { compose, isDue, legsFor, londonTime } from "@/lib/alerts";
import { LINE_IDS } from "@/lib/lines";
import { linksFor } from "@/lib/network";
import { send } from "@/lib/push";
import { timeToSlot } from "@/lib/seats";
import { all, remove, save } from "@/lib/store";
import { getLineStatus } from "@/lib/tfl";

/**
 * Called every few minutes by a scheduler (.github/workflows/alerts.yml) with the CRON_SECRET.
 * Sends each due commute its alert, if there's anything worth saying, at most once a day.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not allowed" }, { status: 401 });

  const now = londonTime(new Date());
  const links = linksFor(now.weekday);
  const subscribers = await all();
  const due = subscribers.flatMap((subscriber) => subscriber.commutes.filter((c) => isDue(c, now, c.lastSent)).map((commute) => ({ subscriber, commute })));
  const counts = { due: due.length, sent: 0, quiet: 0, gone: 0, failed: 0 };

  // One TfL call covering every line any due commute uses.
  const routes = due.map(({ commute }) => legsFor(links, commute, timeToSlot(...(commute.time.split(":").map(Number) as [number, number]))));
  const ids = [...new Set(routes.flatMap((legs) => (legs ?? []).flatMap((leg) => LINE_IDS[leg.line] ?? [])))].sort();
  const status = ids.length ? await getLineStatus(ids).catch(() => []) : [];

  const gone = new Set<string>();
  for (const [i, { subscriber, commute }] of due.entries()) {
    if (gone.has(subscriber.id)) continue;
    const used = new Set((routes[i] ?? []).flatMap((leg) => (leg.line === "Circle / Hammersmith & City" ? ["Circle", "Hammersmith & City"] : [leg.line])));
    const alert = compose(commute, links, status.filter((s) => used.has(s.line)));
    const result = alert ? await send(subscriber.subscription, alert) : "quiet";
    if (result === "gone") {
      await remove(subscriber.id);
      gone.add(subscriber.id);
      counts.gone++;
      continue;
    }
    counts[result]++;
    if (result !== "failed") commute.lastSent = now.date;
  }
  // Save each sign-up once, after all its commutes have been checked.
  for (const subscriber of new Set(due.map((d) => d.subscriber))) if (!gone.has(subscriber.id)) await save(subscriber);
  return Response.json(counts);
}
