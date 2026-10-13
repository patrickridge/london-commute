// The network data on the server, for alerts (the page loads the same files in the browser).

import FRI from "@/public/data/links-FRI.json";
import MON from "@/public/data/links-MON.json";
import SAT from "@/public/data/links-SAT.json";
import SUN from "@/public/data/links-SUN.json";
import TWT from "@/public/data/links-TWT.json";
import stationsJson from "@/public/data/stations.json";

import { DAY_TYPE_BY_WEEKDAY, type Link, type RawLink, toLinks } from "./seats";

const RAW = { MON, TWT, FRI, SAT, SUN } as unknown as Record<string, RawLink[]>;
const cache = new Map<string, Link[]>();

/** Links for a weekday (0 = Sunday). */
export function linksFor(weekday: number): Link[] {
  const day = DAY_TYPE_BY_WEEKDAY[weekday];
  if (!cache.has(day)) cache.set(day, toLinks(RAW[day]));
  return cache.get(day)!;
}

/** name -> [TfL stop ID, latitude, longitude] */
export const STATIONS = stationsJson as unknown as Record<string, [string, number, number]>;
