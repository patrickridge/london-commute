// Other ways to make the same trip: get off early and walk, stay on a line and walk instead of
// changing, finish (or start) by Santander Cycle, or skip the tube altogether. Each option gets
// a time and the same seat answer as the main journey, so they can be compared side by side.

import { type Dock, distanceM, hireTrip, minutes, OWN_BIKE_KMH, type Point, ROUTE_FACTOR, WALK_KMH } from "./bikes";
import {
  hardToBoard,
  journey,
  type Leg,
  type Level,
  type Link,
  overall,
  type Overall,
  peopleAt,
  SLOT_MINUTES,
  SLOTS,
  TRAINS,
} from "./seats";

const CHANGE_COST = 4; // as in plan(): a change counts as four stops
const MINUTES_PER_STOP = 2;
const MINUTES_PER_CHANGE = 5;
const WAIT_MIN = 2; // average wait on the platform for each train
const MAX_WALK_MIN = 20; // longest walk at either end worth suggesting
const MAX_BIKE_KM = 5; // longest hire-bike leg worth combining with the tube
const UNLOCK_MIN = 2; // finding the dock, unlocking and docking
const WORTH_EXTRA_MIN = 8; // an option slower than the tube by more than this isn't shown
const MAX_SHOWN = 4;

export type Step =
  | { mode: "tube"; line: string; from: string; to: string; stops: number; level: Level | null }
  | { mode: "walk"; from: string; to: string; minutes: number }
  | { mode: "hire"; from: string; to: string; minutes: number }
  | { mode: "bike"; minutes: number };

export type Kind = "tube" | "walk-end" | "tube-hire" | "hire-tube" | "hire" | "own-bike" | "walk";

export interface Option {
  kind: Kind;
  minutes: number;
  steps: Step[];
  /** Seat answer over the tube parts; null when there's no tube. */
  crowding: Overall | null;
  changes: number;
  /** A tube part where some trains are likely too full to get on. */
  fullDoors: boolean;
}

export interface Places {
  /** Station name -> [TfL stop ID, latitude, longitude] */
  stations: Record<string, [string, number, number]>;
}

const point = (places: Places, name: string): Point => {
  const [, lat, lon] = places.stations[name];
  return { lat, lon };
};

export const walkMinutes = (a: Point, b: Point) => minutes(ROUTE_FACTOR * distanceM(a, b), WALK_KMH);

// ---------- routes to or from many stations at once ----------

type Tree = { cost: Map<string, number>; cameBy: Map<string, { prev: string; link: Link }> };

/**
 * Dijkstra over (station, line) pairs, as in plan(), but run once for every station. With
 * `backwards`, it searches from `source` along links in reverse, giving routes *to* it.
 */
function search(links: Link[], source: string, slot: number, backwards = false): Tree {
  const out = new Map<string, Link[]>();
  for (const link of links) {
    if (peopleAt(link, slot) === null) continue;
    const at = backwards ? link.to : link.from;
    out.set(at, [...(out.get(at) ?? []), link]);
  }
  const key = (station: string, line: string) => `${station}|${line}`;
  const cost = new Map<string, number>([[key(source, ""), 0]]);
  const cameBy = new Map<string, { prev: string; link: Link }>();
  // A simple binary heap keeps this quick enough to run for every station near both ends.
  const heap: [number, string, string][] = [[0, source, ""]];
  const push = (item: [number, string, string]) => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  while (heap.length) {
    const [c, station, line] = pop();
    if (c > (cost.get(key(station, line)) ?? Infinity)) continue;
    for (const link of out.get(station) ?? []) {
      const next = c + 1 + (line && link.line !== line ? CHANGE_COST : 0);
      const to = backwards ? link.from : link.to;
      const state = key(to, link.line);
      if (next < (cost.get(state) ?? Infinity)) {
        cost.set(state, next);
        cameBy.set(state, { prev: key(station, line), link });
        push([next, to, link.line]);
      }
    }
  }
  return { cost, cameBy };
}

/** The cheapest route in a search tree that reaches (or, backwards, starts from) `station`. */
function route(tree: Tree, station: string, backwards = false): Link[] | null {
  let bestKey: string | null = null;
  for (const [k, c] of tree.cost) {
    if (k.startsWith(`${station}|`) && !k.endsWith("|") && (bestKey === null || c < tree.cost.get(bestKey)!)) bestKey = k;
  }
  if (bestKey === null) return null;
  const path: Link[] = [];
  for (let k = bestKey; tree.cameBy.has(k); k = tree.cameBy.get(k)!.prev) path.push(tree.cameBy.get(k)!.link);
  return backwards ? path : path.reverse();
}

function toLegs(path: Link[], startMinutes: number): Leg[] {
  const legs: Leg[] = [];
  let at = startMinutes;
  for (const link of path) {
    const last = legs.at(-1);
    if (last && last.line === link.line) last.links.push(link);
    else {
      if (last) at += MINUTES_PER_STOP * last.links.length + MINUTES_PER_CHANGE;
      legs.push({ line: link.line, links: [link], minutesIn: at });
    }
  }
  return legs;
}

const roughMinutes = (legs: Leg[]) =>
  legs.reduce((sum, leg) => sum + WAIT_MIN + MINUTES_PER_STOP * leg.links.length, 0) + MINUTES_PER_CHANGE * Math.max(0, legs.length - 1);

function tubeSteps(legs: Leg[], slot: number) {
  const steps: Step[] = [];
  let fullDoors = false;
  const levels: (Level | null)[] = [];
  for (const leg of legs) {
    const band = (slot + Math.floor(leg.minutesIn / SLOT_MINUTES)) % SLOTS;
    const train = TRAINS[leg.line];
    const trip = journey(leg.links, band, train);
    levels.push(trip.level);
    if (hardToBoard(trip.people, train)) fullDoors = true;
    steps.push({ mode: "tube", line: leg.line, from: leg.links[0].from, to: leg.links.at(-1)!.to, stops: leg.links.length, level: trip.level });
  }
  return { steps, crowding: overall(levels), fullDoors };
}

// ---------- the options ----------

export interface Trip {
  links: Link[];
  places: Places;
  from: string;
  to: string;
  slot: number;
  /** The main route, from plan(). */
  legs: Leg[];
  /** TfL's station-to-station time for the main route, if known. */
  tubeMinutes: number | null;
  /** Live Santander Cycles docks, if known. */
  docks: Dock[] | null;
  /** Where the trip really starts and ends, if not at the stations (e.g. from a postcode). */
  door?: { from?: Point; to?: Point };
}

/** Every option worth showing, fastest first. The tube all the way is always included. */
export function options(trip: Trip): Option[] {
  const { links, places, from, to, slot, legs, docks } = trip;
  const station = { from: point(places, from), to: point(places, to) };
  // Bikes and walks go door to door; the tube needs a walk to and from the station.
  const origin = trip.door?.from ?? station.from;
  const dest = trip.door?.to ?? station.to;
  const walkIn = trip.door?.from ? walkMinutes(origin, station.from) : 0;
  const walkOut = trip.door?.to ? walkMinutes(station.to, dest) : 0;
  const first: Step[] = walkIn ? [{ mode: "walk", from: "start", to: from, minutes: walkIn }] : [];
  const last: Step[] = walkOut ? [{ mode: "walk", from: to, to: "destination", minutes: walkOut }] : [];
  // Scale rough tube times so the main route matches TfL's own figure.
  const scale = trip.tubeMinutes ? Math.min(1.5, Math.max(0.7, trip.tubeMinutes / roughMinutes(legs))) : 1;
  const tubeTime = (l: Leg[]) => scale * roughMinutes(l);

  const main = tubeSteps(legs, slot);
  const found: Option[] = [
    {
      kind: "tube",
      minutes: walkIn + (trip.tubeMinutes ?? tubeTime(legs)) + walkOut,
      steps: [...first, ...main.steps, ...last],
      crowding: main.crowding,
      changes: legs.length - 1,
      fullDoors: main.fullDoors,
    },
  ];

  const names = Object.keys(places.stations).filter((n) => n !== from && n !== to);
  const forward = search(links, from, slot);

  // Get off somewhere else and walk the rest: covers both "get off early" and "stay on instead of changing".
  let bestWalkEnd: Option | null = null;
  for (const name of names) {
    const walk = walkMinutes(point(places, name), dest);
    if (walk > MAX_WALK_MIN || walk < 3) continue;
    const path = route(forward, name);
    if (!path) continue;
    const l = toLegs(path, 0);
    const t = tubeSteps(l, slot);
    const option: Option = {
      kind: "walk-end",
      minutes: walkIn + tubeTime(l) + walk,
      steps: [...first, ...t.steps, { mode: "walk", from: name, to, minutes: walk }],
      crowding: t.crowding,
      changes: l.length - 1,
      fullDoors: t.fullDoors,
    };
    if (!bestWalkEnd || better(option, bestWalkEnd)) bestWalkEnd = option;
  }
  if (bestWalkEnd) found.push(bestWalkEnd);

  if (docks) {
    // Tube part way, then a hire bike.
    let bestTubeHire: Option | null = null;
    for (const name of names) {
      const at = point(places, name);
      if (distanceM(at, dest) > MAX_BIKE_KM * 1000 || distanceM(at, dest) > distanceM(origin, dest)) continue;
      const bike = hireTrip(docks, at, dest);
      if (bike.minutes === null || bike.minutes + UNLOCK_MIN > walkMinutes(at, dest) - 3) continue;
      const path = route(forward, name);
      if (!path || path.length < 2) continue;
      const l = toLegs(path, 0);
      const t = tubeSteps(l, slot);
      const option: Option = {
        kind: "tube-hire",
        minutes: walkIn + tubeTime(l) + bike.minutes + UNLOCK_MIN,
        steps: [...first, ...t.steps, { mode: "hire", from: name, to, minutes: bike.minutes + UNLOCK_MIN }],
        crowding: t.crowding,
        changes: l.length - 1,
        fullDoors: t.fullDoors,
      };
      if (!bestTubeHire || better(option, bestTubeHire)) bestTubeHire = option;
    }
    if (bestTubeHire) found.push(bestTubeHire);

    // A hire bike to another station, then the tube.
    const backward = search(links, to, slot, true);
    let bestHireTube: Option | null = null;
    for (const name of names) {
      const at = point(places, name);
      if (distanceM(origin, at) > MAX_BIKE_KM * 1000 || distanceM(at, dest) > distanceM(origin, dest)) continue;
      const bike = hireTrip(docks, origin, at);
      if (bike.minutes === null) continue;
      const path = route(backward, name, true);
      if (!path || path.length < 3) continue;
      const ride = bike.minutes + UNLOCK_MIN;
      const l = toLegs(path, ride);
      const t = tubeSteps(l, slot);
      const option: Option = {
        kind: "hire-tube",
        minutes: ride + tubeTime(l) + walkOut,
        steps: [{ mode: "hire", from, to: name, minutes: ride }, ...t.steps, ...last],
        crowding: t.crowding,
        changes: l.length - 1,
        fullDoors: t.fullDoors,
      };
      if (!bestHireTube || better(option, bestHireTube)) bestHireTube = option;
    }
    if (bestHireTube) found.push(bestHireTube);

    const hire = hireTrip(docks, origin, dest);
    if (hire.minutes !== null) {
      const m = hire.minutes + UNLOCK_MIN;
      found.push({ kind: "hire", minutes: m, steps: [{ mode: "hire", from, to, minutes: m }], crowding: null, changes: 0, fullDoors: false });
    }
  }

  const ownBike = minutes(ROUTE_FACTOR * distanceM(origin, dest), OWN_BIKE_KMH);
  found.push({ kind: "own-bike", minutes: ownBike, steps: [{ mode: "bike", minutes: ownBike }], crowding: null, changes: 0, fullDoors: false });
  const walk = walkMinutes(origin, dest);
  found.push({ kind: "walk", minutes: walk, steps: [{ mode: "walk", from, to, minutes: walk }], crowding: null, changes: 0, fullDoors: false });

  const limit = found[0].minutes + WORTH_EXTRA_MIN;
  const others = found
    .slice(1)
    .filter((o) => o.minutes <= limit && worthIt(o, found[0]))
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, MAX_SHOWN - 1);
  return [found[0], ...others].map((o) => ({ ...o, minutes: Math.round(o.minutes) })).sort((a, b) => a.minutes - b.minutes);
}

const RANK: Record<Overall, number> = { seat: 0, maybe: 1, part: 2, stand: 3, packed: 4 };
const comfort = (o: Option) => (o.crowding === null ? (o.kind === "tube" ? 9 : -1) : RANK[o.crowding]) + (o.fullDoors ? 0.5 : 0);

/** Within one kind of option, prefer the quicker one unless the other is clearly more comfortable. */
function better(a: Option, b: Option) {
  if (comfort(a) < comfort(b) && a.minutes <= b.minutes + 5) return true;
  if (comfort(a) > comfort(b) && b.minutes <= a.minutes + 5) return false;
  return a.minutes < b.minutes || (a.minutes === b.minutes && a.changes < b.changes);
}

/** An alternative is worth showing if it's quicker, more comfortable, or saves a change. */
function worthIt(o: Option, tube: Option) {
  return o.minutes < tube.minutes || comfort(o) < comfort(tube) || o.changes < tube.changes;
}

/** Short labels: the quickest option, and the most comfortable one if that's different. */
export function badges(list: Option[]): Map<Option, string[]> {
  const out = new Map(list.map((o) => [o, [] as string[]]));
  if (!list.length) return out;
  const fastest = list.reduce((a, b) => (b.minutes < a.minutes ? b : a));
  out.get(fastest)!.push("Fastest");
  const calmest = list.reduce((a, b) => (comfort(b) < comfort(a) ? b : a));
  if (calmest !== fastest && comfort(calmest) < comfort(fastest)) out.get(calmest)!.push(calmest.crowding ? "Best chance of a seat" : "No crowds");
  const tube = list.find((o) => o.kind === "tube")!;
  for (const o of list) if (o.kind !== "tube" && o.crowding !== null && o.changes < tube.changes) out.get(o)!.push(o.changes === 0 ? "No change" : "Fewer changes");
  return out;
}
