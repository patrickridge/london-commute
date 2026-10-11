import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { Dock } from "./bikes";
import { badges, options } from "./options";
import { plan, toLinks, type RawLink } from "./seats";

const root = join(__dirname, "..");
const read = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const links = toLinks(read("public/data/links-TWT.json") as RawLink[]);
const places = { stations: read("public/data/stations.json") };
// A snapshot of every Santander Cycles dock, taken on a Sunday evening.
const docks: Dock[] = read("test/fixtures/docks.json");

const trip = (from: string, to: string, slot = 34, tubeMinutes: number | null = null) =>
  options({ links, places, from, to, slot, legs: plan(links, from, to, slot)!, tubeMinutes, docks });

describe("options", () => {
  it("always includes the tube, fastest option first", () => {
    const list = trip("Balham", "Green Park", 34, 18);
    expect(list.some((o) => o.kind === "tube")).toBe(true);
    expect(list.map((o) => o.minutes)).toEqual([...list.map((o) => o.minutes)].sort((a, b) => a - b));
  });

  it("uses TfL's own time for the tube all the way", () => {
    expect(trip("Balham", "Green Park", 34, 18).find((o) => o.kind === "tube")!.minutes).toBe(18);
  });

  it("offers staying on the Northern line instead of changing at Stockwell", () => {
    const stayOn = trip("Balham", "Green Park").find((o) => o.kind === "tube-hire" || o.kind === "walk-end")!;
    expect(stayOn.changes).toBe(0);
    expect(stayOn.steps[0]).toMatchObject({ mode: "tube", line: "Northern", from: "Balham" });
    expect(stayOn.steps.at(-1)).toMatchObject({ to: "Green Park" });
  });

  it("suggests walking between stations that are close together", () => {
    expect(trip("Covent Garden", "Leicester Square").find((o) => o.kind === "walk")?.minutes).toBeLessThanOrEqual(6);
  });

  it("leaves out options that are slower and no better", () => {
    expect(trip("Stratford", "Bond Street")).toHaveLength(1); // a direct train with a seat: nothing beats it
  });

  it("shows at most four options", () => {
    expect(trip("Waterloo", "Liverpool Street").length).toBeLessThanOrEqual(4);
  });

  it("labels the fastest option and one without a change", () => {
    const labels = [...badges(trip("Balham", "Green Park")).values()].flat();
    expect(labels).toContain("Fastest");
    expect(labels).toContain("No change");
  });
});
