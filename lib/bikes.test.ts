import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  HIRE_KMH,
  OWN_BIKE_KMH,
  ROUTE_FACTOR,
  distanceM,
  hireTrip,
  minutes,
  nearby,
  ownBikeMinutes,
  parseDocks,
  parseJourneyMinutes,
  type Dock,
} from "./bikes";

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, "../test/fixtures", name), "utf8"));

// Along the equator, 0.001 degrees of longitude is about 111 metres, which keeps distances easy.
const STEP = distanceM({ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 });
const A = { lat: 0, lon: 0 };
const B = { lat: 0, lon: 0.1 }; // about 11.1 km east of A
const dock = (name: string, lon: number, bikes = 5, spaces = 5, ebikes = 0): Dock => ({ name, lat: 0, lon, bikes, ebikes, spaces });

describe("distances", () => {
  it("is about 111 m per thousandth of a degree at the equator", () => {
    expect(STEP).toBeCloseTo(111.2, 0);
    expect(minutes(1_000, 15)).toBeCloseTo(4);
  });

  it("keeps docks within walking distance, nearest first", () => {
    const docks = [dock("far", 0.006), dock("near", 0.001), dock("mid", 0.003)];
    expect(nearby(docks, A).map((d) => d.dock.name)).toEqual(["near", "mid"]);
  });
});

describe("hireTrip", () => {
  it("uses the nearest dock with a bike and the nearest with a space", () => {
    const docks = [dock("A-empty", 0.001, 0), dock("A-full", 0.002, 3, 5, 1), dock("B-full", 0.099, 5, 0), dock("B-free", 0.098, 5, 4)];
    const trip = hireTrip(docks, A, B);
    expect([trip.start?.name, trip.end?.name]).toEqual(["A-full", "B-free"]);
    expect([trip.bikesNearby, trip.ebikesNearby, trip.spacesNearby]).toEqual([3, 1, 4]);
    const expected = minutes(2 * STEP, 4.8) + minutes(ROUTE_FACTOR * 96 * STEP, HIRE_KMH) + minutes(2 * STEP, 4.8);
    expect(trip.minutes).toBeCloseTo(expected, 1);
  });

  it("has no time without docks or bikes", () => {
    expect(hireTrip([], A, B).minutes).toBeNull();
    const noBikes = hireTrip([dock("A-empty", 0.001, 0), dock("B", 0.099)], A, B);
    expect(noBikes.minutes).toBeNull();
    expect(noBikes.docksAtStart).toBe(1);
  });

  it("times your own bike from the straight-line distance", () => {
    expect(ownBikeMinutes(A, B)).toBeCloseTo(minutes(ROUTE_FACTOR * distanceM(A, B), OWN_BIKE_KMH));
  });
});

describe("parsing TfL responses", () => {
  it("reads docks and skips broken entries", () => {
    const docks = parseDocks(fixture("bikepoints.json"));
    expect(docks.map((d) => d.name)).toEqual(["Waterloo Station 1, Waterloo", "Birkenhead Street, King's Cross"]);
    expect(parseDocks(null)).toEqual([]);
  });

  it("takes the shortest journey", () => {
    expect(parseJourneyMinutes(fixture("journey_balham_oxford_circus.json"))).toBe(19);
    expect(parseJourneyMinutes({ journeys: [] })).toBeNull();
    expect(parseJourneyMinutes(null)).toBeNull();
  });
});
