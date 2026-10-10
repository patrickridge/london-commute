import { ImageResponse } from "next/og";

import { TrainMark } from "./train-mark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Browser-tab icon: the train mark from the header.
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#2563eb", borderRadius: 7 }}>
        <TrainMark size={22} />
      </div>
    ),
    size,
  );
}
