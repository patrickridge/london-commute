import { connection } from "next/server";

import { getDocks } from "@/lib/tfl";

/** Live Santander Cycles docks, for comparing ways to make a trip in the browser. */
export async function GET() {
  await connection(); // fetch on request (cached for a few minutes), never at build time
  try {
    return Response.json(await getDocks());
  } catch {
    return Response.json({ error: "Dock data isn't available right now" }, { status: 502 });
  }
}
