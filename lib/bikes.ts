// Santander Cycles: nearby docks and a rough door-to-door bike time.
// Dock data comes from TfL's BikePoint API (live counts of bikes and free spaces at each dock).

export const WALK_RADIUS_M = 500; // about a 6-minute walk
export const WALK_KMH = 4.8;
export const HIRE_KMH = 15; // a typical pace on a heavy hire bike in city traffic
export const OWN_BIKE_KMH = 18;
export const ROUTE_FACTOR = 1.3; // roads are longer than a straight line

export interface Point {
  lat: number;
  lon: number;
}

export interface Dock extends Point {
  name: string;
  bikes: number; // all bikes, including e-bikes
  ebikes: number;
  spaces: number;
}

interface RawBikePoint {
  commonName?: unknown;
  lat?: unknown;
  lon?: unknown;
  additionalProperties?: { key: string; value: string }[];
}

/** Turn TfL's BikePoint response into docks, skipping any entry that's missing a count. */
export function parseDocks(raw: unknown): Dock[] {
  if (!Array.isArray(raw)) return [];
  const docks: Dock[] = [];
  for (const point of raw as RawBikePoint[]) {
    const props = new Map((point.additionalProperties ?? []).map((p) => [p.key, p.value]));
    const bikes = Number(props.get("NbBikes")); // NaN if missing, so the entry is skipped below
    const spaces = Number(props.get("NbEmptyDocks"));
    const ebikes = Number(props.get("NbEBikes") ?? 0);
    if (typeof point.commonName !== "string" || ![bikes, spaces, ebikes].every(Number.isFinite)) continue;
    docks.push({ name: point.commonName, lat: Number(point.lat), lon: Number(point.lon), bikes, ebikes, spaces });
  }
  return docks;
}

/** Straight-line distance on the Earth's surface (haversine formula). */
export function distanceM(a: Point, b: Point): number {
  const r = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export function minutes(metres: number, kmh: number): number {
  return (metres / 1000 / kmh) * 60;
}

/** Docks within walking distance of a place, nearest first. */
export function nearby(docks: Dock[], place: Point, radiusM = WALK_RADIUS_M): { dock: Dock; metres: number }[] {
  return docks
    .map((dock) => ({ dock, metres: distanceM(place, dock) }))
    .filter((d) => d.metres <= radiusM)
    .sort((a, b) => a.metres - b.metres);
}

export function ownBikeMinutes(origin: Point, dest: Point): number {
  return minutes(ROUTE_FACTOR * distanceM(origin, dest), OWN_BIKE_KMH);
}

export interface BikeTrip {
  start: Dock | null; // nearest dock with a bike, if any
  end: Dock | null; // nearest dock with a free space, if any
  bikesNearby: number;
  ebikesNearby: number;
  spacesNearby: number;
  docksAtStart: number; // docks within walking distance, whatever they hold
  docksAtEnd: number;
  minutes: number | null; // walk + ride + walk; null if there's no bike or no space
}

/** Door-to-door time by Santander Cycle, using the nearest dock with a bike and the nearest dock
 * with a free space. */
export function hireTrip(docks: Dock[], origin: Point, dest: Point): BikeTrip {
  const nearStart = nearby(docks, origin);
  const nearEnd = nearby(docks, dest);
  const start = nearStart.find((d) => d.dock.bikes > 0) ?? null;
  const end = nearEnd.find((d) => d.dock.spaces > 0) ?? null;
  let total: number | null = null;
  if (start && end) {
    const ride = ROUTE_FACTOR * distanceM(start.dock, end.dock);
    total = minutes(start.metres, WALK_KMH) + minutes(ride, HIRE_KMH) + minutes(end.metres, WALK_KMH);
  }
  return {
    start: start?.dock ?? null,
    end: end?.dock ?? null,
    bikesNearby: nearStart.reduce((sum, d) => sum + d.dock.bikes, 0),
    ebikesNearby: nearStart.reduce((sum, d) => sum + d.dock.ebikes, 0),
    spacesNearby: nearEnd.reduce((sum, d) => sum + d.dock.spaces, 0),
    docksAtStart: nearStart.length,
    docksAtEnd: nearEnd.length,
    minutes: total,
  };
}

/** Shortest journey time in TfL's Journey Planner response, or null if it found none. */
export function parseJourneyMinutes(raw: unknown): number | null {
  const journeys = (raw as { journeys?: { duration?: unknown }[] } | null)?.journeys;
  if (!Array.isArray(journeys)) return null;
  const durations = journeys
    .map((j) => j?.duration)
    .filter((d): d is number => typeof d === "number" && Number.isInteger(d) && d > 0);
  return durations.length ? Math.min(...durations) : null;
}
