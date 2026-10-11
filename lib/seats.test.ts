import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SLOTS,
  TRAINS,
  betterEarlier,
  hardToBoard,
  journey,
  legSlot,
  level,
  overall,
  peopleAt,
  plan,
  slotLabel,
  timeToSlot,
  toLinks,
  type Link,
  type RawLink,
} from "./seats";

const TRAIN = { seats: 100, capacity: 500 };
const flat = (people: number | null) => Array<number | null>(SLOTS).fill(people);
const link = (from: string, to: string, people: number | null = 50, line = "Test"): Link => ({
  line,
  from,
  to,
  perTrain: flat(people),
});

// A -> B -> C -> D one way and back, with a branch B -> E.
const LINE = [link("A", "B"), link("B", "C"), link("C", "D"), link("D", "C"), link("C", "B"), link("B", "A"), link("B", "E")];
const stops = (legs: ReturnType<typeof plan>) => legs?.map((leg) => leg.links.map((lk) => `${lk.from}>${lk.to}`));

describe("times", () => {
  it("converts between slots and clock times", () => {
    expect(timeToSlot(9, 37)).toBe(38);
    expect(slotLabel(38)).toBe("09:30");
    expect(slotLabel(-1)).toBe("23:45");
  });
});

describe("plan", () => {
  it("follows the direction of travel", () => {
    expect(stops(plan(LINE, "A", "D", 32))).toEqual([["A>B", "B>C", "C>D"]]);
    expect(stops(plan(LINE, "D", "A", 32))).toEqual([["D>C", "C>B", "B>A"]]);
  });

  it("takes branches and handles impossible trips", () => {
    expect(stops(plan(LINE, "A", "E", 32))).toEqual([["A>B", "B>E"]]);
    expect(plan(LINE, "E", "A", 32)).toBeNull();
    expect(plan(LINE, "A", "A", 32)).toEqual([]);
  });

  const network = [link("P", "Q", 50, "X"), link("Q", "R", 50, "X"), link("R", "S", 50, "X"), link("Q", "T", 50, "Y")];

  it("changes line and splits the route into legs", () => {
    const legs = plan(network, "P", "T", 32)!;
    expect(legs.map((leg) => leg.line)).toEqual(["X", "Y"]);
    expect(legs[1].minutesIn).toBe(2 + 5); // one stop, then a change
    expect(legSlot(32, legs[1])).toBe(32);
  });

  it("stays on a line rather than changing to save a stop", () => {
    const legs = plan([...network, link("Q", "R", 50, "Y")], "P", "R", 32)!;
    expect(legs.map((leg) => leg.line)).toEqual(["X"]);
  });

  it("skips lines that aren't running, but not half-hourly ones", () => {
    const closed = { ...link("P", "R", null, "Shuttle") };
    expect(plan([...network, closed], "P", "R", 70)!.map((leg) => leg.line)).toEqual(["X"]);
    const halfHourly = flat(null);
    halfHourly[33] = 100;
    expect(plan([{ line: "Slow", from: "P", to: "Q", perTrain: halfHourly }], "P", "Q", 32)).not.toBeNull();
  });
});

describe("seat levels", () => {
  it.each([
    [0, "seat"],
    [79, "seat"],
    [80, "maybe"],
    [109, "maybe"],
    [111, "stand"], // 1.1 * 100 is 110.00000000000001, so test just past it
    [449, "stand"],
    [450, "packed"],
  ])("%i people is %s", (people, expected) => {
    expect(level(people, TRAIN)).toBe(expected);
  });

  it("warns about full doors from 55% of capacity, but not once it's packed", () => {
    expect(hardToBoard(274, TRAIN)).toBe(false);
    expect(hardToBoard(276, TRAIN)).toBe(true);
    expect(hardToBoard(450, TRAIN)).toBe(false); // the packed headline already says so
    expect(hardToBoard(null, TRAIN)).toBe(false);
  });

  it("uses the next train when a band is empty", () => {
    const perTrain = flat(null);
    perTrain[33] = 120;
    perTrain[31] = 80;
    const lk = { line: "T", from: "A", to: "B", perTrain };
    expect(peopleAt(lk, 32)).toBe(120); // none at 08:00: wait for 08:15
    expect(peopleAt(lk, 30)).toBe(80); // none at 07:30: wait for 07:45
    expect(peopleAt(lk, 40)).toBeNull();
  });

  it("finds where seats free up", () => {
    const trip = journey([link("A", "B", 300), link("B", "C", 150), link("C", "D", 60)], 32, TRAIN);
    expect(trip).toEqual({ people: 300, level: "stand", seatFrom: "C" });
  });

  it("suggests the latest earlier band that's better", () => {
    const perTrain = flat(300);
    perTrain[31] = 90;
    perTrain[30] = 50;
    expect(betterEarlier([{ line: "T", from: "A", to: "B", perTrain }], 32, TRAIN)).toEqual([31, "maybe"]);
    expect(betterEarlier([link("A", "B", 50)], 32, TRAIN)).toBeNull();
  });

  it.each([
    [["seat", "seat"], "seat"],
    [["stand", "seat"], "part"],
    [["maybe", "packed"], "part"],
    [["stand", "packed"], "packed"],
    [[null, "stand"], "stand"],
    [[null], null],
  ] as const)("overall of %j is %s", (levels, expected) => {
    expect(overall([...levels])).toBe(expected);
  });
});

describe("matches the Python version", () => {
  // test/fixtures/python-journeys.json: 300 random journeys answered by the tested Python code
  // (tube-crowding repo), so both versions must pick the same routes and seat levels.
  const root = join(__dirname, "..");
  const cases: {
    day: string;
    from: string;
    to: string;
    slot: number;
    legs: [string, string, string, string | null][] | null;
    overall: string | null;
  }[] = JSON.parse(readFileSync(join(root, "test/fixtures/python-journeys.json"), "utf8"));
  const byDay = new Map<string, Link[]>();
  const linksFor = (day: string) => {
    if (!byDay.has(day)) {
      const raw: RawLink[] = JSON.parse(readFileSync(join(root, `public/data/links-${day}.json`), "utf8"));
      byDay.set(day, toLinks(raw));
    }
    return byDay.get(day)!;
  };

  it("for 300 random journeys", () => {
    for (const c of cases) {
      const legs = plan(linksFor(c.day), c.from, c.to, c.slot);
      if (c.legs === null) {
        expect(legs, `${c.from} to ${c.to}`).toBeNull();
        continue;
      }
      const trips = legs!.map((leg) => journey(leg.links, legSlot(c.slot, leg), TRAINS[leg.line]));
      const got = legs!.map((leg, i) => [leg.line, leg.links[0].from, leg.links.at(-1)!.to, trips[i].level]);
      expect(got, `${c.from} to ${c.to} on ${c.day}`).toEqual(c.legs);
      expect(overall(trips.map((t) => t.level))).toBe(c.overall);
    }
  });
});
