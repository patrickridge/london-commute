import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LINE_IDS, parseLineStatus } from "./lines";
import { TRAINS } from "./seats";

describe("line status", () => {
  it("has a TfL ID for every line in the crowding data", () => {
    for (const line of Object.keys(TRAINS)) expect(LINE_IDS[line]?.length).toBeGreaterThan(0);
  });

  it("reads TfL's response, worst first, with the reason trimmed", () => {
    // A real response, taken while the Central line had severe delays.
    const raw = JSON.parse(readFileSync(join(__dirname, "../test/fixtures/line_status.json"), "utf8"));
    const list = parseLineStatus(raw);
    expect(list[0]).toMatchObject({ line: "Central", severity: 6, status: "Severe Delays" });
    expect(list[0].reason).toMatch(/^Central Line: Severe delays/);
    expect(list[0].reason).toBe(list[0].reason!.trim());
    expect(list.at(-1)).toMatchObject({ status: "Good Service", reason: null });
    expect(list.map((l) => l.severity)).toEqual([...list.map((l) => l.severity)].sort((a, b) => a - b));
    expect(parseLineStatus(null)).toEqual([]);
  });
});
