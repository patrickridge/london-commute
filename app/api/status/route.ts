import { connection } from "next/server";

import { LINE_IDS } from "@/lib/lines";
import { getLineStatus } from "@/lib/tfl";

/** Live status of the lines on a journey: /api/status?lines=Northern,Victoria */
export async function GET(request: Request) {
  await connection(); // live data: fetched on request (cached for a minute or two), never at build time
  const names = (new URL(request.url).searchParams.get("lines") ?? "").split(",").filter((n) => n in LINE_IDS);
  if (!names.length) return Response.json({ error: "Unknown lines" }, { status: 400 });
  const ids = [...new Set(names.flatMap((n) => LINE_IDS[n]))].sort();
  try {
    return Response.json(await getLineStatus(ids));
  } catch {
    return Response.json({ error: "Line status isn't available right now" }, { status: 502 });
  }
}
