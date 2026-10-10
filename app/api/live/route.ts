import { hireTrip, ownBikeMinutes } from "@/lib/bikes";
import { getDocks, getTubeMinutes } from "@/lib/tfl";
import stationsJson from "@/public/data/stations.json";

// name -> [TfL stop ID, latitude, longitude]
const stations = stationsJson as unknown as Record<string, [string, number, number]>;

/** Live part of a journey: tube time, Santander Cycles near each end, and own-bike time. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const from = stations[query.get("from") ?? ""];
  const to = stations[query.get("to") ?? ""];
  if (!from || !to) return Response.json({ error: "Unknown station" }, { status: 400 });

  const start = { lat: from[1], lon: from[2] };
  const end = { lat: to[1], lon: to[2] };
  // Each part can fail on its own (TfL is sometimes slow); the page shows what it gets.
  const [tube, docks] = await Promise.all([
    getTubeMinutes(from[0], to[0]).catch(() => null),
    getDocks().catch(() => null),
  ]);
  return Response.json({
    tubeMinutes: tube,
    bike: docks ? hireTrip(docks, start, end) : null,
    ownBikeMinutes: Math.round(ownBikeMinutes(start, end)),
  });
}
