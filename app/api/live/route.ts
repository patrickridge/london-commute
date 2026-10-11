import { getTubeMinutes } from "@/lib/tfl";
import stationsJson from "@/public/data/stations.json";

// name -> [TfL stop ID, latitude, longitude]
const stations = stationsJson as unknown as Record<string, [string, number, number]>;

/** TfL's journey time between two stations. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const from = stations[query.get("from") ?? ""];
  const to = stations[query.get("to") ?? ""];
  if (!from || !to) return Response.json({ error: "Unknown station" }, { status: 400 });
  // TfL is sometimes slow; the page falls back to its own estimate.
  const tubeMinutes = await getTubeMinutes(from[0], to[0]).catch(() => null);
  return Response.json({ tubeMinutes });
}
