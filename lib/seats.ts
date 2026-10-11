// Will I get a seat? Route planning and seat levels over TfL's NUMBAT 2025 train loads.
// Each link is one stretch of line in one direction, with the typical number of people on each
// train leaving its first station in every 15-minute band of the day (null = no trains).

export const SLOTS = 96;
export const SLOT_MINUTES = 15;

export interface Train {
  seats: number;
  capacity: number; // seated + standing
}

// Seats and total capacity per train, from TfL's rolling stock information sheets.
export const TRAINS: Record<string, Train> = {
  Bakerloo: { seats: 268, capacity: 851 },
  Central: { seats: 272, capacity: 1047 },
  "Circle / Hammersmith & City": { seats: 256, capacity: 1045 },
  District: { seats: 256, capacity: 1045 },
  "Elizabeth line": { seats: 454, capacity: 1500 },
  Jubilee: { seats: 234, capacity: 964 },
  Metropolitan: { seats: 306, capacity: 1176 },
  Northern: { seats: 248, capacity: 752 },
  Piccadilly: { seats: 228, capacity: 798 },
  Victoria: { seats: 288, capacity: 986 },
  "Waterloo & City": { seats: 136, capacity: 506 },
};

// NUMBAT publishes five day types; JavaScript's getDay() counts from Sunday.
export const DAY_TYPE_BY_WEEKDAY = ["SUN", "MON", "TWT", "TWT", "TWT", "FRI", "SAT"] as const;
export type DayType = (typeof DAY_TYPE_BY_WEEKDAY)[number];

export interface Link {
  line: string;
  from: string;
  to: string;
  perTrain: (number | null)[];
}

export type RawLink = [string, string, string, (number | null)[]];

export function toLinks(raw: RawLink[]): Link[] {
  return raw.map(([line, from, to, perTrain]) => ({ line, from, to, perTrain }));
}

export function slotLabel(slot: number): string {
  const minutes = (((slot % SLOTS) + SLOTS) % SLOTS) * SLOT_MINUTES;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function timeToSlot(hour: number, minute: number): number {
  return Math.floor((hour * 60 + minute) / SLOT_MINUTES);
}

/**
 * People per train in this band. Some lines only run every 30 minutes, leaving empty bands, so if
 * there's no train in this band, use the next one (you'd wait for it), then the one before.
 */
export function peopleAt(link: Link, slot: number): number | null {
  for (const band of [slot, slot + 1, slot - 1]) {
    const value = link.perTrain[((band % SLOTS) + SLOTS) % SLOTS];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

// ---------- planning a journey ----------

const CHANGE_COST = 4; // a change "costs" as much as 4 stops, so routes don't swap lines to save one
const MINUTES_PER_STOP = 2; // rough, only used to pick the 15-minute band for later legs
const MINUTES_PER_CHANGE = 5;

export interface Leg {
  line: string;
  links: Link[];
  minutesIn: number; // rough minutes from setting off to boarding this leg
}

/**
 * Cheapest route from origin to dest, split into one leg per line. Dijkstra's algorithm over
 * (station, line) pairs: each stop costs 1 and each change of line costs CHANGE_COST. Stretches
 * with no trains around `slot` are left out, so routes never use a line that isn't running.
 */
export function plan(links: Link[], origin: string, dest: string, slot: number): Leg[] | null {
  const outgoing = new Map<string, Link[]>();
  for (const link of links) {
    if (peopleAt(link, slot) === null) continue;
    outgoing.set(link.from, [...(outgoing.get(link.from) ?? []), link]);
  }

  const key = (station: string, line: string) => `${station}|${line}`;
  const best = new Map<string, number>([[key(origin, ""), 0]]);
  const cameBy = new Map<string, { prev: string; link: Link }>();
  const queue: { cost: number; station: string; line: string }[] = [{ cost: 0, station: origin, line: "" }];

  while (queue.length > 0) {
    // The network is small (a few hundred stations), so a sorted array is plenty fast. Ties are
    // broken by station then line name, the same order as the Python version's heap.
    queue.sort((a, b) => a.cost - b.cost || compare(a.station, b.station) || compare(a.line, b.line));
    const { cost, station, line } = queue.shift()!;
    if (station === dest) {
      const path: Link[] = [];
      let state = key(station, line);
      while (cameBy.has(state)) {
        const step = cameBy.get(state)!;
        path.push(step.link);
        state = step.prev;
      }
      return toLegs(path.reverse());
    }
    if (cost > (best.get(key(station, line)) ?? Infinity)) continue;
    for (const link of outgoing.get(station) ?? []) {
      const next = cost + 1 + (line && link.line !== line ? CHANGE_COST : 0);
      const state = key(link.to, link.line);
      if (next < (best.get(state) ?? Infinity)) {
        best.set(state, next);
        cameBy.set(state, { prev: key(station, line), link });
        queue.push({ cost: next, station: link.to, line: link.line });
      }
    }
  }
  return null;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function toLegs(path: Link[]): Leg[] {
  const legs: Leg[] = [];
  let minutes = 0;
  for (const link of path) {
    const last = legs.at(-1);
    if (last && last.line === link.line) {
      last.links.push(link);
    } else {
      if (last) minutes += MINUTES_PER_STOP * last.links.length + MINUTES_PER_CHANGE;
      legs.push({ line: link.line, links: [link], minutesIn: minutes });
    }
  }
  return legs;
}

/** The 15-minute band you're likely to board this leg in, if you set off in `slot`. */
export function legSlot(slot: number, leg: Leg): number {
  return (slot + Math.floor(leg.minutesIn / SLOT_MINUTES)) % SLOTS;
}

// ---------- how full is the train? ----------

// My thresholds, not TfL's. The figures are averages over the whole train, and the ends of a
// train are usually emptier than the middle, so "seat" needs some slack below the seat count.
const SEAT = 0.8; // of seats
const MAYBE = 1.1; // of seats
const PACKED = 0.9; // of total capacity
// Capacity assumes everyone packed in tight. People stop moving down well before that, so from
// just over half of it an average train is full by the doors and some can't be boarded.
const DOORS_FULL = 0.55; // of total capacity

export const LEVELS = ["seat", "maybe", "stand", "packed"] as const;
export type Level = (typeof LEVELS)[number];

export function level(people: number | null, train: Train): Level | null {
  if (people === null) return null;
  if (people >= PACKED * train.capacity) return "packed";
  if (people < SEAT * train.seats) return "seat";
  if (people < MAYBE * train.seats) return "maybe";
  return "stand";
}

/** True when, at this load, some trains are likely too full by the doors to get on. */
export function hardToBoard(people: number | null, train: Train): boolean {
  return people !== null && people >= DOORS_FULL * train.capacity && people < PACKED * train.capacity;
}

export interface Journey {
  people: number | null; // on the train as it leaves your station
  level: Level | null;
  seatFrom: string | null; // first station where a seat becomes likely, if you start standing
}

export function journey(links: Link[], slot: number, train: Train): Journey {
  const people = peopleAt(links[0], slot);
  const board = level(people, train);
  let seatFrom: string | null = null;
  if (board !== null && board !== "seat") {
    seatFrom = links.slice(1).find((link) => level(peopleAt(link, slot), train) === "seat")?.from ?? null;
  }
  return { people, level: board, seatFrom };
}

/** The latest earlier band (up to `steps` x 15 min) where boarding is a better level. */
export function betterEarlier(links: Link[], slot: number, train: Train, steps = 2): [number, Level] | null {
  const now = level(peopleAt(links[0], slot), train);
  if (now === null || now === "seat") return null;
  for (let back = 1; back <= steps; back++) {
    const earlier = (slot - back + SLOTS) % SLOTS;
    const option = level(links[0].perTrain[earlier] ?? null, train);
    if (option !== null && LEVELS.indexOf(option) < LEVELS.indexOf(now)) return [earlier, option];
  }
  return null;
}

export type Overall = Level | "part";

/** One answer for the whole trip: the shared level, "part" if you'd sit for only some of it,
 * otherwise the worst leg. */
export function overall(levels: (Level | null)[]): Overall | null {
  const known = levels.filter((lv): lv is Level => lv !== null);
  if (known.length === 0) return null;
  if (new Set(known).size === 1) return known[0];
  if (known.includes("seat") || known.includes("maybe")) return "part";
  return known.reduce((worst, lv) => (LEVELS.indexOf(lv) > LEVELS.indexOf(worst) ? lv : worst));
}
