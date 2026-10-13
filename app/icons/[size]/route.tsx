import { ImageResponse } from "next/og";

import { TrainMark } from "../../train-mark";

const SIZES = [192, 512];

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

/** App icons for the home screen, in the sizes the web app manifest asks for. */
export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.includes(size)) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#2563eb" }}>
        <TrainMark size={Math.round(size * 0.62)} />
      </div>
    ),
    { width: size, height: size },
  );
}
