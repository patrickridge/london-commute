// Starting or ending at an address: look up a postcode, then find the stations within walking distance.

import type { Point } from "./bikes";
import { walkMinutes } from "./options";

/** A full UK postcode, with or without the space. */
export const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

export interface Place extends Point {
  postcode: string;
}

/** Look a postcode up with postcodes.io (free, no key). Null if it doesn't exist. */
export async function lookupPostcode(postcode: string): Promise<Place | null> {
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`);
  if (!res.ok) return null;
  const { result } = (await res.json()) as { result?: { postcode: string; latitude: number | null; longitude: number | null } };
  if (!result || result.latitude === null || result.longitude === null) return null;
  return { postcode: result.postcode, lat: result.latitude, lon: result.longitude };
}

/** Stations within `maxMinutes` walk of a place, nearest first. */
export function nearestStations(stations: Record<string, [string, number, number]>, place: Point, limit = 3, maxMinutes = 25) {
  return Object.entries(stations)
    .map(([name, [, lat, lon]]) => ({ name, minutes: walkMinutes(place, { lat, lon }) }))
    .filter((s) => s.minutes <= maxMinutes)
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, limit);
}
