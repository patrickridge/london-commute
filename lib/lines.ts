// Line names in the crowding data, their TfL IDs, and TfL's live status responses.

/** TfL line IDs for the line names used in the crowding data. */
export const LINE_IDS: Record<string, string[]> = {
  Bakerloo: ["bakerloo"],
  Central: ["central"],
  "Circle / Hammersmith & City": ["circle", "hammersmith-city"],
  District: ["district"],
  "Elizabeth line": ["elizabeth"],
  Jubilee: ["jubilee"],
  Metropolitan: ["metropolitan"],
  Northern: ["northern"],
  Piccadilly: ["piccadilly"],
  Victoria: ["victoria"],
  "Waterloo & City": ["waterloo-city"],
  DLR: ["dlr"],
  Mildmay: ["mildmay"],
  Windrush: ["windrush"],
};

export interface LineStatus {
  line: string;
  /** TfL's severity: 10 is good service, lower is worse. */
  severity: number;
  status: string;
  reason: string | null;
}

export function parseLineStatus(raw: unknown): LineStatus[] {
  if (!Array.isArray(raw)) return [];
  return (raw as { name?: string; lineStatuses?: { statusSeverity?: number; statusSeverityDescription?: string; reason?: string }[] }[])
    .flatMap((line) =>
      (line.lineStatuses ?? []).map((s) => ({
        line: line.name ?? "",
        severity: typeof s.statusSeverity === "number" ? s.statusSeverity : 10,
        status: s.statusSeverityDescription ?? "",
        reason: s.reason?.trim() || null,
      })),
    )
    .sort((a, b) => a.severity - b.severity);
}
