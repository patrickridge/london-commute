// A simple front-on train drawn in SVG, used by the generated icons and preview image.
export function TrainMark({ size, colour = "white" }: { size: number; colour?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="14" rx="3" />
      <path d="M5 10h14" />
      <path d="M8 21l2-4M16 21l-2-4" />
      <circle cx="9" cy="13.5" r="0.6" fill={colour} />
      <circle cx="15" cy="13.5" r="0.6" fill={colour} />
    </svg>
  );
}
