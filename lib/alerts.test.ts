import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { type Commute, compose, isDue, londonTime } from "./alerts";
import { parseLineStatus } from "./lines";
import { toLinks, type RawLink } from "./seats";

const read = (p: string) => JSON.parse(readFileSync(join(__dirname, "..", p), "utf8"));
const links = toLinks(read("public/data/links-TWT.json") as RawLink[]);
// A real TfL response from a morning when the Central line had severe delays.
const status = parseLineStatus(read("test/fixtures/line_status.json"));
const good = status.filter((s) => s.line !== "Central");

const commute = (over: Partial<Commute> = {}): Commute => ({ from: "Liverpool Street", to: "Oxford Circus", time: "08:30", days: [1, 2, 3, 4, 5], mode: "issues", ...over });

describe("london time", () => {
  it("follows British Summer Time and GMT", () => {
    expect(londonTime(new Date("2026-07-15T07:10:00Z"))).toEqual({ weekday: 3, minutes: 8 * 60 + 10, date: "2026-07-15" });
    expect(londonTime(new Date("2026-12-15T07:10:00Z"))).toEqual({ weekday: 2, minutes: 7 * 60 + 10, date: "2026-12-15" });
  });
});

describe("isDue", () => {
  const tuesday = (hh: number, mm: number) => ({ weekday: 2, minutes: hh * 60 + mm, date: "2026-10-13" });

  it("is due from 45 to 5 minutes before leaving", () => {
    expect(isDue(commute(), tuesday(7, 44), null)).toBe(false);
    expect(isDue(commute(), tuesday(7, 45), null)).toBe(true);
    expect(isDue(commute(), tuesday(8, 25), null)).toBe(true);
    expect(isDue(commute(), tuesday(8, 26), null)).toBe(false);
  });

  it("sends at most once a day, and only on chosen days", () => {
    expect(isDue(commute(), tuesday(8, 0), "2026-10-13")).toBe(false);
    expect(isDue(commute(), tuesday(8, 0), "2026-10-12")).toBe(true);
    expect(isDue(commute({ days: [1] }), tuesday(8, 0), null)).toBe(false);
  });
});

describe("compose", () => {
  it("leads with delays on the lines you use, with TfL's reason", () => {
    const alert = compose(commute(), links, status.filter((s) => s.line === "Central"))!;
    expect(alert.title).toBe("Central: Severe Delays");
    expect(alert.body).toMatch(/^For your 08:30 Liverpool Street to Oxford Circus\. Central Line: Severe delays/);
    expect(alert.url).toBe("/?from=Liverpool+Street&to=Oxford+Circus&time=08%3A30");
  });

  it("stays quiet on a normal day, unless asked for a daily summary", () => {
    const quiet = commute({ from: "Stratford", to: "Bond Street", time: "11:00" });
    expect(compose(quiet, links, good)).toBeNull();
    expect(compose({ ...quiet, mode: "daily" }, links, good)?.title).toBe("Good service for your 11:00");
  });

  it("suggests a nearby time when it's clearly calmer", () => {
    const alert = compose(commute({ from: "Ealing Broadway", to: "Oxford Circus", time: "08:00" }), links, good)!;
    expect(alert.title).toBe("Leave at 07:30 for a calmer train?");
    expect(alert.body).toMatch(/some trains may be too full to get on\. At 07:30, you'll get a seat for part of it/);
  });

  it("always says something for a test notification", () => {
    expect(compose(commute({ from: "Stratford", to: "Bond Street", time: "11:00" }), links, good, { force: true })).not.toBeNull();
  });
});
