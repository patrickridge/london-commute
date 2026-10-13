import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { type Commute, compose, isDue, londonTime, routeName } from "./alerts";
import { parseLineStatus } from "./lines";
import { routeChoices, toLinks, toRoute, type RawLink } from "./seats";

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
  const st = (line: string, severity: number, status: string) => ({ line, severity, status, reason: null });

  it("leads with delays, and says when to leave or which way to go instead", () => {
    const alert = compose(commute(), links, status.filter((s) => s.line === "Central"))!;
    expect(alert.title).toBe("Central line: Severe Delays");
    expect(alert.body).toBe("08:30 to Oxford Circus: leave by 08:15, or take the Elizabeth line to Tottenham Court Road, then the Central line.");
    expect(alert.url).toBe("/?from=Liverpool+Street&to=Oxford+Circus&time=08%3A30");
  });

  it("suggests a change of line to get round delays", () => {
    const balham = commute({ from: "Balham", to: "Warren Street" });
    expect(compose(balham, links, [st("Northern", 9, "Minor Delays")])!.body).toBe("08:30 to Warren Street: leave by 08:25, or change at Stockwell for the Victoria line.");
    expect(compose(balham, links, [st("Northern", 3, "Part Suspended")])!.body).toBe("08:30 to Warren Street: change at Stockwell for the Victoria line.");
  });

  it("stays quiet on a normal day, unless asked for a daily summary", () => {
    const quiet = commute({ from: "Stratford", to: "Bond Street", time: "11:00" });
    expect(compose(quiet, links, good)).toBeNull();
    expect(compose({ ...quiet, mode: "daily" }, links, good)).toMatchObject({ title: "Good service for your 11:00", body: "Elizabeth line is running normally. Leave as usual." });
  });

  it("suggests a nearby time when it's clearly calmer", () => {
    const alert = compose(commute({ from: "Ealing Broadway", to: "Oxford Circus", time: "08:00" }), links, good)!;
    expect(alert.title).toBe("Leave at 07:30 for a seat part of the way");
    expect(alert.body).toBe("Your 08:00 to Oxford Circus is standing room only and trains may be too full to get on.");
  });

  it("always says something for a test notification", () => {
    expect(compose(commute({ from: "Stratford", to: "Bond Street", time: "11:00" }), links, good, { force: true })).not.toBeNull();
  });

  it("follows the route you actually take", () => {
    const choices = routeChoices(links, "Balham", "Warren Street", 34).map(toRoute);
    expect(choices.map(routeName)).toEqual(["Northern line all the way", "Northern, change at Stockwell for Victoria"]);
    const usual = commute({ from: "Balham", to: "Warren Street", route: choices[1] });
    expect(compose(usual, links, [st("Victoria", 6, "Severe Delays")])!.body).toBe("08:30 to Warren Street: leave by 08:15, or stay on the Northern line.");
    expect(compose(usual, links, [st("Northern", 6, "Severe Delays")])!.body).toBe("08:30 to Warren Street: leave by 08:15.");
  });
});
