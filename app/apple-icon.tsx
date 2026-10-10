import { ImageResponse } from "next/og";

import { TrainMark } from "./train-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Home-screen icon on iPhones; iOS rounds the corners itself.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#2563eb" }}>
        <TrainMark size={120} />
      </div>
    ),
    size,
  );
}
