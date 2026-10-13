// Commute alerts: whether one is due, and what it should say. Sent only when something matters:
// delays on the lines you use, or a calmer time to leave. Kept free of storage and push code so it
// can be tested on its own.

import type { LineStatus } from "./lines";
import { followRoute, hardToBoard, journey, type Leg, legSlot, type Link, type Overall, overall, plan, type Route, SLOTS, slotLabel, timeToSlot, TRAINS } from "./seats";

export interface Commute {
  from: string;
  to: string;
  /** Usual leaving time, "HH:MM", London time. */
  time: string;
  /** Days to check, 0 = Sunday. */
  days: number[];
  /** "issues": only when something's wrong or a better time exists. "daily": a summary every time. */
  mode: "issues" | "daily";
  /** The way you usually go, if not the planner's first choice. */
  route?: Route;
}

export interface Alert {
  title: string;
  body: string;
  url: string;
}

/** Alerts go out in this window before the leaving time, so a late scheduler still lands in time. */
export const EARLIEST_BEFORE = 45;
export const LATEST_BEFORE = 5;

export interface LondonTime {
  /** 0 = Sunday */
  weekday: number;
  minutes: number;
  /** "YYYY-MM-DD", for sending at most once a day */
  date: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function londonTime(at: Date): LondonTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    weekday: WEEKDAYS.indexOf(parts.weekday),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export function isDue(commute: Commute, now: LondonTime, lastSent: string | null): boolean {
  if (lastSent === now.date || !commute.days.includes(now.weekday)) return false;
  const leave = minutesOf(commute.time);
  return now.minutes >= leave - EARLIEST_BEFORE && now.minutes <= leave - LATEST_BEFORE;
}

const RANK: Record<Overall, number> = { seat: 0, maybe: 1, part: 2, stand: 3, packed: 4 };

/** "Northern line all the way", "Northern, change at Stockwell for Victoria". */
export function routeName(route: Route) {
  const name = (line: string) => line.replace(/ line$/, "");
  if (route.length === 1) return `${name(route[0].line)}${route[0].line === "DLR" ? "" : " line"} all the way`;
  return [name(route[0].line), ...route.slice(1).map((leg) => `change at ${leg.from} for ${name(leg.line)}`)].join(", ");
}

/** "Victoria line", "DLR", "Elizabeth line". */
const label = (line: string) => (line === "DLR" ? line : `${line.replace(/ line$/, "")} line`);
export const lineName = (line: string) => `the ${label(line)}`;
/** "Northern line", "Northern and Victoria lines". */
const lineList = (lines: string[]) =>
  lines.length === 1 ? label(lines[0]) : `${lines.slice(0, -1).map((l) => l.replace(/ line$/, "")).join(", ")} and ${lines.at(-1)!.replace(/ line$/, "")} lines`;

/** TfL reports the Circle and Hammersmith & City separately; the crowding data has them together. */
const crowdingLine = (statusLine: string) => (statusLine === "Circle" || statusLine === "Hammersmith & City" ? "Circle / Hammersmith & City" : statusLine);

/** Extra minutes to allow for TfL's severity, or null when the line is part closed or suspended. */
function extraMinutes(severity: number) {
  if (severity === 9) return 5; // minor delays
  if (severity === 6 || severity === 7) return 15; // severe delays, reduced service
  return null;
}

const clock = (minutes: number) => `${String(Math.floor((minutes + 1440) % 1440 / 60)).padStart(2, "0")}:${String((minutes + 1440) % 60).padStart(2, "0")}`;

/** "change at Stockwell for the Victoria line", "stay on the Northern line", or "take the Elizabeth line to Tottenham Court Road, then the Central line". */
function describe(route: Leg[], usual: Leg[]) {
  const end = (leg: Leg) => leg.links.at(-1)!.to;
  if (route[0].line === usual[0].line) {
    if (route.length === 1) return `stay on ${lineName(route[0].line)}`;
    return route.slice(1).map((leg) => `change at ${leg.links[0].from} for ${lineName(leg.line)}`).join(", then ");
  }
  return route.map((leg, i) => (i === 0 ? `take ${lineName(leg.line)} to ${end(leg)}` : i === route.length - 1 ? `then ${lineName(leg.line)}` : `then ${lineName(leg.line)} to ${end(leg)}`)).join(", ");
}

const stopsOn = (legs: Leg[], lines: ReadonlySet<string>) => legs.reduce((n, leg) => n + (lines.has(leg.line) ? leg.links.length : 0), 0);

/** The commute's legs at this time: its saved route if that's running, otherwise the planner's. */
export function legsFor(links: Link[], commute: Commute, slot: number): Leg[] | null {
  return (commute.route && followRoute(links, commute.route, slot)) || plan(links, commute.from, commute.to, slot);
}

function crowding(links: Link[], commute: Commute, slot: number) {
  const legs = legsFor(links, commute, slot);
  if (!legs) return null;
  const trips = legs.map((leg) => journey(leg.links, legSlot(slot, leg), TRAINS[leg.line]));
  return { crowd: overall(trips.map((t) => t.level)), fullDoors: legs.some((leg, i) => hardToBoard(trips[i].people, TRAINS[leg.line])) };
}

/** The nearest time up to 30 minutes either side that's clearly calmer: a better seat answer, or trains you can get on. */
function calmerTime(links: Link[], commute: Commute, slot: number, crowd: Overall | null, fullDoors: boolean) {
  const score = (c: Overall | null, doors: boolean) => (c ? RANK[c] : 9) + (doors ? 1.5 : 0);
  const now = score(crowd, fullDoors);
  for (const offset of [-1, 1, -2, 2]) {
    const s = (slot + offset + SLOTS) % SLOTS;
    const other = crowding(links, commute, s);
    if (other && score(other.crowd, other.fullDoors) <= now - 1) return { slot: s, ...other };
  }
  return null;
}

/**
 * The alert for a commute, or null if there's nothing worth saying (in "issues" mode). `status` is
 * TfL's live status for the lines on the route. Kept short: what's wrong and what to do about it.
 */
export function compose(commute: Commute, links: Link[], status: LineStatus[], { force = false } = {}): Alert | null {
  const url = `/?${new URLSearchParams({ from: commute.from, to: commute.to, time: commute.time })}`;
  const slot = timeToSlot(...(commute.time.split(":").map(Number) as [number, number]));
  const legs = legsFor(links, commute, slot);
  if (!legs) return force ? { title: "No route at your usual time", body: `No trains from ${commute.from} to ${commute.to} at ${commute.time}.`, url } : null;
  const trip = `${commute.time} to ${commute.to}`;

  // Worst status per line on the route.
  const worst = new Map<string, LineStatus>();
  for (const s of [...status].sort((a, b) => a.severity - b.severity)) if (!worst.has(s.line)) worst.set(s.line, s);
  const problems = [...worst.values()].filter((s) => s.severity < 10);

  if (problems.length) {
    const title = problems.length === 1 ? `${label(problems[0].line)}: ${problems[0].status}` : `Delays on the ${lineList(problems.map((p) => p.line))}`;
    const avoid = new Set(problems.map((p) => crowdingLine(p.line)));
    const detour = plan(links, commute.from, commute.to, slot, avoid);
    const way = detour && stopsOn(detour, avoid) < stopsOn(legs, avoid) ? describe(detour, legs) : null;
    const extras = problems.map((p) => extraMinutes(p.severity));
    const extra = extras.includes(null) ? null : Math.max(...(extras as number[]));
    const leave = extra ? `leave by ${clock(minutesOf(commute.time) - extra)}` : null;
    const advice = leave && way ? `${leave}, or ${way}` : (leave ?? way ?? "check another way before you leave");
    return { title, body: `${trip}: ${advice}.`, url };
  }

  const { crowd, fullDoors } = crowding(links, commute, slot)!;
  const calmer = crowd === "stand" || crowd === "packed" || fullDoors ? calmerTime(links, commute, slot, crowd, fullDoors) : null;
  if (calmer) {
    const gain = calmer.crowd === "seat" || calmer.crowd === "maybe" ? "a seat" : calmer.crowd === "part" ? "a seat part of the way" : "a calmer train";
    const now = crowd === "packed" ? "packed" : crowd === "stand" ? "standing room only" : "busy";
    return {
      title: `Leave at ${slotLabel(calmer.slot)} for ${gain}`,
      body: `Your ${trip} is ${now}${fullDoors ? " and trains may be too full to get on" : ""}.`,
      url,
    };
  }

  if (commute.mode === "daily" || force) {
    const lines = [...new Set(legs.map((l) => l.line))];
    return { title: `Good service for your ${commute.time}`, body: `${lineList(lines)} ${lines.length === 1 ? "is" : "are"} running normally. Leave as usual.`, url };
  }
  return null;
}
