// Server-side calls to TfL's Unified API. The key stays on the server (TFL_APP_KEY).
import { cacheLife } from "next/cache";

import { parseDocks, parseJourneyMinutes, type Dock } from "@/lib/bikes";
import { type LineStatus, parseLineStatus } from "@/lib/lines";

const BASE = "https://api.tfl.gov.uk";

async function tfl(path: string, query: Record<string, string> = {}): Promise<unknown> {
  const params = new URLSearchParams(query);
  if (process.env.TFL_APP_KEY) params.set("app_key", process.env.TFL_APP_KEY);
  const res = await fetch(`${BASE}${path}?${params}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`TfL returned ${res.status} for ${path}`);
  return res.json();
}

/** Every Santander Cycles dock with its live counts. Docks change fast, so cache briefly. */
export async function getDocks(): Promise<Dock[]> {
  "use cache";
  cacheLife("minutes");
  return parseDocks(await tfl("/BikePoint"));
}

/** Station-to-station time by Underground, Elizabeth line, DLR or Overground, from TfL's Journey Planner. */
export async function getTubeMinutes(fromId: string, toId: string): Promise<number | null> {
  "use cache";
  cacheLife("days");
  return parseJourneyMinutes(
    await tfl(`/Journey/JourneyResults/${fromId}/to/${toId}`, { mode: "tube,elizabeth-line,dlr,overground,walking" }),
  );
}

/** Live status of some lines, e.g. "Minor Delays", worst first. Changes quickly, so cached briefly. */
export async function getLineStatus(ids: string[]): Promise<LineStatus[]> {
  "use cache";
  cacheLife("minutes");
  return parseLineStatus(await tfl(`/Line/${ids.join(",")}/Status`));
}
