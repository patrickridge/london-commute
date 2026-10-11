import { ImageResponse } from "next/og";

import { TrainMark } from "./train-mark";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "London commute planner: tube time, seats, and better ways to do the trip.";

// Preview image for shared links.
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#f8fafc", color: "#0f172a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 36, fontWeight: 600 }}>
          <div style={{ width: 64, height: 64, display: "flex", alignItems: "center", justifyContent: "center", background: "#2563eb", borderRadius: 14 }}>
            <TrainMark size={42} />
          </div>
          London commute planner
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 80, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>Plan your commute</div>
          <div style={{ fontSize: 34, color: "#475569", lineHeight: 1.35 }}>
            How long it takes, whether you&apos;ll get a seat, and whether there&apos;s a better way to do it.
          </div>
        </div>
        <div style={{ fontSize: 26, color: "#2563eb", fontWeight: 600 }}>Underground · Elizabeth line · Santander Cycles</div>
      </div>
    ),
    size,
  );
}
