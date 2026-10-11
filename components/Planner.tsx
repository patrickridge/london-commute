"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, Bike, Clock, Lightbulb, TrainFront, TriangleAlert } from "lucide-react";

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
import type { BikeTrip } from "@/lib/bikes";
import {
  DAY_TYPE_BY_WEEKDAY,
  TRAINS,
  betterEarlier,
  hardToBoard,
  journey,
  legSlot,
  overall,
  plan,
  slotLabel,
  timeToSlot,
  toLinks,
  type Leg,
  type Level,
  type Link,
  type Overall,
  type RawLink,
} from "@/lib/seats";

const DEFAULT = { from: "Balham", to: "Oxford Circus" };
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
};

interface Live {
  tubeMinutes: number | null;
  bike: BikeTrip | null;
  ownBikeMinutes: number;
}

function nowRounded(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes() - (now.getMinutes() % 15)).padStart(2, "0")}`;
}

export function Planner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [stations, setStations] = useState<string[]>([]);
  const [from, setFrom] = useState(params.get("from") ?? DEFAULT.from);
  const [to, setTo] = useState(params.get("to") ?? DEFAULT.to);
  const [weekday, setWeekday] = useState(() => new Date().getDay());
  const [time, setTime] = useState(params.get("time") ?? nowRounded());
  // Loaded data remembers what it was loaded for, so stale results are never shown.
  const [loadedLinks, setLoadedLinks] = useState<{ day: string; links: Link[] } | null>(null);
  const [loadedLive, setLoadedLive] = useState<{ trip: string; live: Live } | null>(null);

  const dayType = DAY_TYPE_BY_WEEKDAY[weekday];
  const trip = `${from}|${to}`;
  const links = loadedLinks?.day === dayType ? loadedLinks.links : null;
  const live = loadedLive?.trip === trip ? loadedLive.live : null;

  useEffect(() => {
    fetch("/data/stations.json")
      .then((res) => res.json())
      .then((data: Record<string, unknown>) => setStations(Object.keys(data)));
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

  // Keep the journey in the URL so it can be bookmarked. The day isn't saved: a bookmark opens on today.
  useEffect(() => {
    router.replace(`${pathname}?${new URLSearchParams({ from, to, time })}`, { scroll: false });
  }, [from, to, time, pathname, router]);

  const [hours, mins] = time.split(":").map(Number);
  const slot = timeToSlot(hours || 0, mins || 0);
  const legs = useMemo(() => (links && from !== to ? plan(links, from, to, slot) : null), [links, from, to, slot]);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Your commute</CardTitle>
          <CardDescription>Any two Underground or Elizabeth line stations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StationField id="from" label="From" value={from} onChange={setFrom} stations={stations} />
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFrom(to);
                setTo(from);
              }}
            >
              <ArrowLeftRight /> Swap for the way back
            </Button>
          </div>
          <StationField id="to" label="To" value={to} onChange={setTo} stations={stations} />
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
            No Underground or Elizabeth line route from {from} to {to} at {slotLabel(slot)}.
          </Message>
        ) : (
          <>
            <JourneyCard legs={legs} slot={slot} tubeMinutes={live?.tubeMinutes ?? null} from={from} />
            <BikeCard live={live} from={from} to={to} />
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

function JourneyCard({ legs, slot, tubeMinutes, from }: { legs: Leg[]; slot: number; tubeMinutes: number | null; from: string }) {
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
            {tubeMinutes ? `${tubeMinutes} min by tube` : `about ${rough} min by tube`}
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
        {earlier && earlier[1] !== "packed" ? (
          <Tip>
            Leave at <strong>{slotLabel(earlier[0])}</strong> and {TIP[earlier[1]]}.
          </Tip>
        ) : trips[0].seatFrom ? (
          <Tip>
            On the {first.line} line, seats usually free up from <strong>{trips[0].seatFrom}</strong>.
          </Tip>
        ) : null}
      </CardContent>
    </Card>
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

function hireText(bike: BikeTrip, from: string, to: string): string {
  if (bike.docksAtStart === 0) return `No docks within a 6-minute walk of ${from}`;
  if (bike.docksAtEnd === 0) return `No docks within a 6-minute walk of ${to}`;
  if (!bike.start) return `No bikes at the docks near ${from} right now`;
  if (!bike.end) return `No free spaces near ${to} right now`;
  const ebikes = bike.ebikesNearby ? `, ${bike.ebikesNearby} electric` : "";
  return `${bike.bikesNearby} bikes${ebikes} near ${from}, ${bike.spacesNearby} free spaces near ${to}`;
}

function BikeCard({ live, from, to }: { live: Live | null; from: string; to: string }) {
  const rows: { icon: React.ReactNode; label: string; minutes: number | null; note: string }[] = live
    ? [
        { icon: <TrainFront className="size-4" />, label: "Tube", minutes: live.tubeMinutes, note: "station to station" },
        {
          icon: <Bike className="size-4" />,
          label: "Santander Cycle",
          minutes: live.bike?.minutes != null ? Math.round(live.bike.minutes) : null,
          note: live.bike ? hireText(live.bike, from, to) : "Live dock data isn't available right now",
        },
        { icon: <Bike className="size-4" />, label: "Your own bike", minutes: live.ownBikeMinutes, note: "door to door, roughly" },
      ]
    : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tube or bike?</CardTitle>
        <CardDescription>Bike and space counts are live, right now.</CardDescription>
      </CardHeader>
      <CardContent>
        {!live ? (
          <p className="text-sm text-muted-foreground">Checking live times…</p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.label} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <div className="flex gap-2">
                  <span className="mt-0.5 text-muted-foreground">{row.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.note}</p>
                  </div>
                </div>
                <p className="text-lg font-semibold tabular-nums whitespace-nowrap">{row.minutes != null ? `${row.minutes} min` : "–"}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Cycling assumes 15 km/h on a hire bike and 18 km/h on your own, on roads about 30% longer than a straight line.
          Lime and other dockless bikes don&apos;t publish open data for London.
        </p>
      </CardContent>
    </Card>
  );
}
