"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, CircleCheck, Clock, Lightbulb, TrainFront, TriangleAlert } from "lucide-react";

import { Alerts } from "@/components/Alerts";
import { routeName } from "@/lib/alerts";
import { Options } from "@/components/Options";
import { PostcodeField } from "@/components/PostcodeField";
import { TrainChart } from "@/components/TrainChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Dock } from "@/lib/bikes";
import { options } from "@/lib/options";
import type { LineStatus } from "@/lib/lines";
import { lookupPostcode, type Place } from "@/lib/places";
import {
  DAY_TYPE_BY_WEEKDAY,
  SLOTS,
  TRAINS,
  betterEarlier,
  hardToBoard,
  modeWord,
  journey,
  legSlot,
  overall,
  followRoute,
  plan,
  routeChoices,
  slotLabel,
  timeToSlot,
  toLinks,
  toRoute,
  type Leg,
  type Level,
  type Link,
  type Overall,
  type RawLink,
} from "@/lib/seats";

const DEFAULT = { from: "Waterloo", to: "Canary Wharf" };
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_TYPE_NAMES = { MON: "Monday", TWT: "Tuesday to Thursday", FRI: "Friday", SAT: "Saturday", SUN: "Sunday" };

const HEADLINES: Record<Overall, { text: string; tone: string }> = {
  seat: { text: "You'll probably get a seat", tone: "text-emerald-700" },
  maybe: { text: "You might get a seat", tone: "text-blue-700" },
  part: { text: "You'll get a seat for part of it", tone: "text-blue-700" },
  stand: { text: "You'll probably stand", tone: "text-amber-700" },
  packed: { text: "Very crowded: you may have to let a train go", tone: "text-red-700" },
};
const LEG_TEXT: Record<Level, string> = {
  seat: "probably a seat",
  maybe: "might get a seat",
  stand: "you'll stand",
  packed: "very crowded",
};
const TIP: Record<Exclude<Level, "packed">, string> = {
  seat: "you'll probably get a seat",
  maybe: "you might get a seat",
  stand: "it's less crowded, though you'll probably still stand",
};
// TfL line colours, for the small line labels.
const LINE_COLOURS: Record<string, [string, string]> = {
  Bakerloo: ["#B36305", "#fff"],
  Central: ["#E32017", "#fff"],
  "Circle / Hammersmith & City": ["#FFD300", "#1c1c1c"],
  District: ["#00782A", "#fff"],
  "Elizabeth line": ["#6950A1", "#fff"],
  Jubilee: ["#A0A5A9", "#1c1c1c"],
  Metropolitan: ["#9B0056", "#fff"],
  Northern: ["#1c1c1c", "#fff"],
  Piccadilly: ["#003688", "#fff"],
  Victoria: ["#0098D4", "#fff"],
  "Waterloo & City": ["#95CDBA", "#1c1c1c"],
  DLR: ["#00A4A7", "#fff"],
  Mildmay: ["#2774AE", "#fff"],
  Windrush: ["#D22730", "#fff"],
};

interface Live {
  tubeMinutes: number | null;
}

type Stations = Record<string, [string, number, number]>;

const SAVE_KEY = "commute";
interface Saved {
  from: string;
  to: string;
  time?: string;
  via?: string;
  fromPostcode?: string;
  toPostcode?: string;
}

function nowRounded(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes() - (now.getMinutes() % 15)).padStart(2, "0")}`;
}

export function Planner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [stations, setStations] = useState<Stations>({});
  const [docks, setDocks] = useState<Dock[] | null>(null);
  const [fromPlace, setFromPlace] = useState<Place | null>(null);
  const [toPlace, setToPlace] = useState<Place | null>(null);
  const [from, setFrom] = useState(params.get("from") ?? DEFAULT.from);
  const [to, setTo] = useState(params.get("to") ?? DEFAULT.to);
  const [weekday, setWeekday] = useState(() => new Date().getDay());
  const [time, setTime] = useState(params.get("time") ?? nowRounded());
  // Where you change, for when you don't take the planner's first choice ("Stockwell").
  const [via, setVia] = useState(params.get("via") ?? "");
  // Loaded data remembers what it was loaded for, so stale results are never shown.
  const [loadedLinks, setLoadedLinks] = useState<{ day: string; links: Link[] } | null>(null);
  const [loadedLive, setLoadedLive] = useState<{ trip: string; live: Live } | null>(null);
  const [loadedStatus, setLoadedStatus] = useState<{ lines: string; status: LineStatus[] } | null>(null);
  // With no journey in the link, the first pass happens before the saved one is restored, so it's skipped.
  const firstPass = useRef(!params.get("from"));

  const dayType = DAY_TYPE_BY_WEEKDAY[weekday];
  const trip = `${from}|${to}`;
  const links = loadedLinks?.day === dayType ? loadedLinks.links : null;
  const live = loadedLive?.trip === trip ? loadedLive.live : null;

  useEffect(() => {
    fetch("/data/stations.json")
      .then((res) => res.json())
      .then((data: Stations) => setStations(data));
    fetch("/api/docks")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Dock[] | null) => setDocks(data))
      .catch(() => {}); // options without hire bikes are still shown
  }, []);

  // Postcodes in a bookmarked link are looked up again; the station in the link stays as chosen.
  // With no journey in the link, open the last one planned on this device.
  useEffect(() => {
    let fromPostcode = params.get("fromPostcode");
    let toPostcode = params.get("toPostcode");
    if (!params.get("from")) {
      try {
        const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null") as Saved | null;
        if (saved?.from && saved.to) {
          /* eslint-disable react-hooks/set-state-in-effect -- restoring browser storage after hydration */
          setFrom(saved.from);
          setTo(saved.to);
          if (saved.time) setTime(saved.time);
          if (saved.via) setVia(saved.via);
          /* eslint-enable react-hooks/set-state-in-effect */
          fromPostcode = saved.fromPostcode ?? null;
          toPostcode = saved.toPostcode ?? null;
        }
      } catch {}
    }
    if (fromPostcode) lookupPostcode(fromPostcode).then(setFromPlace).catch(() => {});
    if (toPostcode) lookupPostcode(toPostcode).then(setToPlace).catch(() => {});
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch(`/data/links-${dayType}.json`)
      .then((res) => res.json())
      .then((raw: RawLink[]) => setLoadedLinks({ day: dayType, links: toLinks(raw) }));
  }, [dayType]);

  useEffect(() => {
    if (from === to) return;
    const controller = new AbortController();
    fetch(`/api/live?${new URLSearchParams({ from, to })}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Live | null) => data && setLoadedLive({ trip: `${from}|${to}`, live: data }))
      .catch(() => {}); // the cards say live data isn't available
    return () => controller.abort();
  }, [from, to]);

  const [hours, mins] = time.split(":").map(Number);
  const slot = timeToSlot(hours || 0, mins || 0);
  const choices = useMemo(() => (links && from !== to ? routeChoices(links, from, to, slot) : []), [links, from, to, slot]);
  const legs = choices.find((c) => changesOf(c) === via) ?? choices[0] ?? null;
  const usual = useMemo(() => (legs ? toRoute(legs) : null), [legs]);
  // Until the network has loaded, keep whatever route was asked for.
  const chosenVia = !choices.length ? via : legs !== choices[0] ? changesOf(legs!) : "";

  // Keep the journey in the URL so it can be bookmarked. The day isn't saved: a bookmark opens on today.
  useEffect(() => {
    if (firstPass.current) {
      firstPass.current = false;
      return;
    }
    const query = new URLSearchParams({ from, to, time });
    if (chosenVia) query.set("via", chosenVia);
    if (fromPlace) query.set("fromPostcode", fromPlace.postcode);
    if (toPlace) query.set("toPostcode", toPlace.postcode);
    router.replace(`${pathname}?${query}`, { scroll: false });
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ from, to, time, via: chosenVia || undefined, fromPostcode: fromPlace?.postcode, toPostcode: toPlace?.postcode } satisfies Saved));
    } catch {}
  }, [from, to, time, chosenVia, fromPlace, toPlace, pathname, router]);

  const names = useMemo(() => Object.keys(stations), [stations]);
  const lines = legs ? [...new Set(legs.map((leg) => leg.line))].sort().join(",") : "";
  const status = loadedStatus?.lines === lines ? loadedStatus.status : null;

  useEffect(() => {
    if (!lines) return;
    const controller = new AbortController();
    fetch(`/api/status?${new URLSearchParams({ lines })}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: LineStatus[] | null) => data && setLoadedStatus({ lines, status: data }))
      .catch(() => {}); // the card just doesn't show live status
    return () => controller.abort();
  }, [lines]);

  // How crowded the trip is if you leave up to 45 minutes earlier or later.
  const nearby = useMemo(() => {
    if (!links || from === to) return null;
    return [-3, -2, -1, 0, 1, 2, 3].map((offset) => {
      const s = (slot + offset + SLOTS) % SLOTS;
      const route = (usual && followRoute(links, usual, s)) || plan(links, from, to, s);
      const trips = route?.map((leg) => journey(leg.links, legSlot(s, leg), TRAINS[leg.line])) ?? [];
      return {
        slot: s,
        level: route ? overall(trips.map((t) => t.level)) : null,
        fullDoors: route ? route.some((leg, i) => hardToBoard(trips[i].people, TRAINS[leg.line])) : false,
      };
    });
  }, [links, from, to, slot, usual]);
  const ways = useMemo(
    () =>
      links && legs && stations[from] && stations[to]
        ? options({
            links,
            places: { stations },
            from,
            to,
            slot,
            legs,
            tubeMinutes: live?.tubeMinutes ?? null,
            docks,
            door: { from: fromPlace ?? undefined, to: toPlace ?? undefined },
          })
        : null,
    [links, legs, stations, from, to, slot, live, docks, fromPlace, toPlace],
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Your commute</CardTitle>
          <CardDescription>Any two Underground, Elizabeth line, DLR or Overground (Mildmay and Windrush) stations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <StationField id="from" label="From" value={from} onChange={setFrom} stations={names} />
            <PostcodeField
              id="from"
              place={fromPlace}
              station={from}
              stations={stations}
              onStation={setFrom}
              onPlace={(place, station) => {
                setFromPlace(place);
                if (station) setFrom(station);
              }}
            />
          </div>
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFrom(to);
                setTo(from);
                setFromPlace(toPlace);
                setToPlace(fromPlace);
              }}
            >
              <ArrowLeftRight /> Swap for the way back
            </Button>
          </div>
          <div className="space-y-2">
            <StationField id="to" label="To" value={to} onChange={setTo} stations={names} />
            <PostcodeField
              id="to"
              place={toPlace}
              station={to}
              stations={stations}
              onStation={setTo}
              onPlace={(place, station) => {
                setToPlace(place);
                if (station) setTo(station);
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="day">Day</Label>
              <Select
                items={DAY_NAMES.map((name, i) => ({ value: String(i), label: name }))}
                value={String(weekday)}
                onValueChange={(value) => value !== null && setWeekday(Number(value))}
              >
                <SelectTrigger id="day" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((name, i) => (
                    <SelectItem key={name} value={String(i)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="time">Leaving at</Label>
              <Input id="time" type="time" step={900} value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {from === to ? (
          <Message>Pick two different stations.</Message>
        ) : !links ? (
          <Message>Loading…</Message>
        ) : !legs ? (
          <Message>
            No route from {from} to {to} at {slotLabel(slot)}.
          </Message>
        ) : (
          <>
            {choices.length > 1 && <RoutePicker choices={choices} chosen={legs} onPick={(c) => setVia(c === choices[0] ? "" : changesOf(c))} />}
            <JourneyCard
              status={status}
              nearby={nearby}
              onTime={(s) => setTime(slotLabel(s))}
              legs={legs}
              slot={slot}
              tubeMinutes={live?.tubeMinutes ?? null}
              doorMinutes={fromPlace || toPlace ? (ways?.find((o) => o.kind === "tube")?.minutes ?? null) : null}
              from={from}
            />
            <Alerts from={from} to={to} time={time} route={usual!} onUsual={(route) => setVia(route.slice(1).map((leg) => leg.from).join(","))} />
            {ways && <Options list={ways} liveBikes={docks !== null} />}
            <TrainChart
              people={legs[0].links[0].perTrain}
              train={TRAINS[legs[0].line]}
              slot={slot}
              title={`How full the ${legs[0].line} line is from ${from}`}
              description={`People on each train, typical ${DAY_TYPE_NAMES[dayType]}`}
            />
          </>
        )}
      </div>
    </div>
  );
}

function StationField(props: { id: string; label: string; value: string; onChange: (v: string) => void; stations: string[] }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Combobox items={props.stations} value={props.value} onValueChange={(v) => v && props.onChange(v as string)}>
        <ComboboxInput id={props.id} placeholder="Search stations" className="w-full" />
        <ComboboxContent>
          <ComboboxEmpty>No station with that name.</ComboboxEmpty>
          <ComboboxList>
            {(name: string) => (
              <ComboboxItem key={name} value={name}>
                {name}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

/** The stations you change at, which tell one route from another: "Stockwell". */
const changesOf = (legs: Leg[]) => legs.slice(1).map((leg) => leg.links[0].from).join(",");

function RoutePicker({ choices, chosen, onPick }: { choices: Leg[][]; chosen: Leg[]; onPick: (legs: Leg[]) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Your usual way</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Your usual way">
        {choices.map((c) => (
          <button
            key={routeName(toRoute(c))}
            type="button"
            role="radio"
            aria-checked={c === chosen}
            onClick={() => onPick(c)}
            className={`rounded-full border px-3 py-1.5 text-sm ${c === chosen ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted"}`}
          >
            {routeName(toRoute(c))}
          </button>
        ))}
      </div>
    </div>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

function LineLabel({ line }: { line: string }) {
  const [background, color] = LINE_COLOURS[line] ?? ["#64748b", "#fff"];
  return (
    <span className="rounded px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap" style={{ background, color }}>
      {line}
    </span>
  );
}

type Nearby = { slot: number; level: Overall | null; fullDoors: boolean }[];

function JourneyCard(props: {
  legs: Leg[];
  slot: number;
  tubeMinutes: number | null;
  doorMinutes: number | null;
  from: string;
  status: LineStatus[] | null;
  nearby: Nearby | null;
  onTime: (slot: number) => void;
}) {
  const { legs, slot, tubeMinutes, doorMinutes, from, status, nearby, onTime } = props;
  const trips = legs.map((leg) => journey(leg.links, legSlot(slot, leg), TRAINS[leg.line]));
  const summary = overall(trips.map((t) => t.level));
  const stops = legs.reduce((n, leg) => n + leg.links.length, 0);
  // Rough fallback if TfL's journey time isn't available: 2 minutes a stop, 5 a change.
  const rough = 2 * stops + 5 * (legs.length - 1);
  const first = legs[0];
  const earlier = betterEarlier(first.links, slot, TRAINS[first.line]);
  const crowdedDoors = legs.findIndex((leg, i) => hardToBoard(trips[i].people, TRAINS[leg.line]));

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className={`text-2xl font-semibold tracking-tight ${summary ? HEADLINES[summary].tone : ""}`}>
            {summary ? HEADLINES[summary].text : `No trains from ${from} at this time`}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="size-4" />
            {doorMinutes
              ? `${doorMinutes} min door to door`
              : `${tubeMinutes ? "" : "about "}${tubeMinutes ?? rough} min by ${modeWord(legs.map((leg) => leg.line))}`}
          </p>
        </div>
        <ol className="space-y-2">
          {legs.map((leg, i) => (
            <li key={`${leg.line}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <TrainFront className="size-4 text-muted-foreground" />
              <LineLabel line={leg.line} />
              <span>
                to {leg.links.at(-1)!.to} · {leg.links.length} stop{leg.links.length === 1 ? "" : "s"}
              </span>
              <span className="font-medium">· {trips[i].level ? LEG_TEXT[trips[i].level] : "no trains at this time"}</span>
            </li>
          ))}
        </ol>
        {crowdedDoors >= 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span>
              At this time, some {legs[crowdedDoors].line} trains may be too full to get on at {legs[crowdedDoors].links[0].from}.
            </span>
          </p>
        )}
        <LiveStatus status={status} lines={legs.map((leg) => leg.line)} />
        {earlier && earlier[1] !== "packed" ? (
          <Tip>
            Leave at <strong>{slotLabel(earlier[0])}</strong> and {TIP[earlier[1]]}.
          </Tip>
        ) : trips[0].seatFrom ? (
          <Tip>
            On the {first.line} line, seats usually free up from <strong>{trips[0].seatFrom}</strong>.
          </Tip>
        ) : null}
        {nearby && <LeaveTimes nearby={nearby} slot={slot} onTime={onTime} />}
      </CardContent>
    </Card>
  );
}

const SHORT: Record<Overall, { text: string; tone: string }> = {
  seat: { text: "Seat", tone: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" },
  maybe: { text: "Maybe", tone: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100" },
  part: { text: "Part", tone: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100" },
  stand: { text: "Stand", tone: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100" },
  packed: { text: "Packed", tone: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100" },
};

/** The same trip leaving up to 45 minutes either side, so you can pick a calmer time. */
function LeaveTimes({ nearby, slot, onTime }: { nearby: Nearby; slot: number; onTime: (slot: number) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">If you leave at…</p>
      <div className="grid grid-cols-7 gap-1">
        {nearby.map((n) => (
          <button
            key={n.slot}
            type="button"
            onClick={() => onTime(n.slot)}
            aria-pressed={n.slot === slot}
            className={`rounded-md px-0.5 py-1.5 text-center text-xs ${n.level ? SHORT[n.level].tone : "bg-muted text-muted-foreground"} ${n.slot === slot ? "ring-2 ring-foreground" : "hover:opacity-80"}`}
          >
            <span className="block tabular-nums">{slotLabel(n.slot)}</span>
            <span className="block font-medium">
              {n.level ? SHORT[n.level].text : "–"}
              {n.fullDoors && <span aria-label="some trains too full to get on"> !</span>}
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">&ldquo;!&rdquo; means some trains may be too full to get on.</p>
    </div>
  );
}

/** Live service on the lines this journey uses, from TfL. */
function LiveStatus({ status, lines }: { status: LineStatus[] | null; lines: string[] }) {
  if (!status) return null;
  // One entry per line, the worst status first (the list only has this journey's lines).
  const worst = new Map<string, LineStatus>();
  for (const s of status) if (!worst.has(s.line)) worst.set(s.line, s);
  const problems = [...worst.values()].filter((s) => s.severity < 10);
  if (!problems.length) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CircleCheck className="size-3.5 text-emerald-600" />
        Good service on {lines.length > 1 ? "these lines" : `the ${lines[0]} line`} right now.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      {problems.map((p) => (
        <div key={p.line} className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-950 dark:bg-red-950 dark:text-red-50">
          <p className="flex items-center gap-1.5 font-medium">
            <TriangleAlert className="size-4 shrink-0 text-red-600" />
            {p.line}: {p.status}
          </p>
          {p.reason && <p className="mt-0.5 text-xs">{p.reason}</p>}
        </div>
      ))}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <span>{children}</span>
    </p>
  );
}
