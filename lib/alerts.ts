// Commute alerts: whether one is due, and what it should say. Sent only when something matters:
// delays on the lines you use, or a calmer time to leave. Kept free of storage and push code so it
// can be tested on its own.

import type { LineStatus } from "./lines";
import { hardToBoard, journey, legSlot, type Link, type Overall, overall, plan, SLOTS, slotLabel, timeToSlot, TRAINS } from "./seats";

export interface Commute {
  from: string;
  to: string;
  /** Usual leaving time, "HH:MM", London time. */
  time: string;
  /** Days to check, 0 = Sunday. */
  days: number[];
  /** "issues": only when something's wrong or a better time exists. "daily": a summary every time. */
  mode: "issues" | "daily";
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

const LEVEL_TEXT = { seat: "you'll probably get a seat", maybe: "you might get a seat", part: "you'll get a seat for part of it", stand: "you'll probably stand", packed: "it'll be very crowded" };

const listLines = (lines: string[]) => (lines.length === 1 ? `the ${lines[0]} line` : `the ${lines.slice(0, -1).join(", ")} and ${lines.at(-1)} lines`);

const RANK: Record<Overall, number> = { seat: 0, maybe: 1, part: 2, stand: 3, packed: 4 };

function crowding(links: Link[], commute: Commute, slot: number) {
  const legs = plan(links, commute.from, commute.to, slot);
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
 * TfL's live status for the lines on the route.
 */
export function compose(commute: Commute, links: Link[], status: LineStatus[], { force = false } = {}): Alert | null {
  const url = `/?${new URLSearchParams({ from: commute.from, to: commute.to, time: commute.time })}`;
  const slot = timeToSlot(...(commute.time.split(":").map(Number) as [number, number]));
  const legs = plan(links, commute.from, commute.to, slot);
  if (!legs) return force ? { title: "No route at your usual time", body: `No trains from ${commute.from} to ${commute.to} at ${commute.time}.`, url } : null;

  const { crowd, fullDoors } = crowding(links, commute, slot)!;
  const calmer = crowd === "stand" || crowd === "packed" || fullDoors ? calmerTime(links, commute, slot, crowd, fullDoors) : null;
  const trip = `${commute.time} ${commute.from} to ${commute.to}`;

  // Worst status per line; TfL lists the Circle and Hammersmith & City separately.
  const worst = new Map<string, LineStatus>();
  for (const s of [...status].sort((a, b) => a.severity - b.severity)) if (!worst.has(s.line)) worst.set(s.line, s);
  const problems = [...worst.values()].filter((s) => s.severity < 10);

  if (problems.length) {
    const title = problems.length === 1 ? `${problems[0].line}: ${problems[0].status}` : `Delays on ${listLines(problems.map((p) => p.line))}`;
    const reason = problems[0].reason ? ` ${problems[0].reason.length > 140 ? `${problems[0].reason.slice(0, 137)}…` : problems[0].reason}` : "";
    return { title, body: `For your ${trip}.${reason}`, url };
  }

  if (calmer) {
    return {
      title: `Leave at ${slotLabel(calmer.slot)} for a calmer train?`,
      body: `Your ${trip}: ${crowd ? LEVEL_TEXT[crowd] : "busy"}${fullDoors ? ", and some trains may be too full to get on" : ""}. At ${slotLabel(calmer.slot)}, ${calmer.crowd ? LEVEL_TEXT[calmer.crowd] : "it's quieter"}${calmer.fullDoors ? "" : " and you should get on the first train"}.`,
      url,
    };
  }

  if (commute.mode === "daily" || force) {
    const lines = [...new Set(legs.map((l) => l.line))];
    return { title: `Good service for your ${commute.time}`, body: `Good service on ${listLines(lines)}; ${crowd ? LEVEL_TEXT[crowd] : "trains are running"}.`, url };
  }
  return null;
}
