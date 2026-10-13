import { Bike, Footprints, TrainFront } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { badges, type Option, type Step } from "@/lib/options";
import { modeWord, type Overall } from "@/lib/seats";

const CROWDING: Record<Overall, string> = {
  seat: "probably a seat",
  maybe: "might get a seat",
  part: "a seat for part of it",
  stand: "you'll stand",
  packed: "very crowded",
};

function title(o: Option, tube: Option): string {
  const firstTube = o.steps.find((s) => s.mode === "tube");
  const lastTube = o.steps.findLast((s) => s.mode === "tube");
  switch (o.kind) {
    case "tube":
      return `${modeWord(o.steps.flatMap((s) => (s.mode === "tube" ? [s.line] : []))) === "tube" ? "Tube" : "Train"} all the way`;
    case "walk-end":
      return o.changes < tube.changes && firstTube?.mode === "tube" && o.changes === 0
        ? `Stay on the ${firstTube.line} line and walk`
        : `Get off at ${lastTube?.mode === "tube" ? lastTube.to : "an earlier stop"} and walk`;
    case "tube-hire":
      return `Tube to ${lastTube?.mode === "tube" ? lastTube.to : "a nearby station"}, then a Santander Cycle`;
    case "hire-tube":
      return `Santander Cycle to ${firstTube?.mode === "tube" ? firstTube.from : "a station"}, then the tube`;
    case "hire":
      return "Santander Cycle all the way";
    case "own-bike":
      return "Your own bike";
    case "walk":
      return "Walk";
  }
}

function StepText({ step }: { step: Step }) {
  switch (step.mode) {
    case "tube":
      return (
        <span className="inline-flex items-center gap-1">
          <TrainFront className="size-3.5" />
          {step.line} to {step.to}
        </span>
      );
    case "walk":
      return (
        <span className="inline-flex items-center gap-1">
          <Footprints className="size-3.5" />
          {Math.round(step.minutes)} min walk
        </span>
      );
    case "hire":
    case "bike":
      return (
        <span className="inline-flex items-center gap-1">
          <Bike className="size-3.5" />
          {Math.round(step.minutes)} min by bike
        </span>
      );
  }
}

/** Other ways to make the trip, with time and how crowded the tube parts are. */
export function Options({ list, liveBikes }: { list: Option[]; liveBikes: boolean }) {
  const tube = list.find((o) => o.kind === "tube")!;
  const labels = badges(list);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ways to do it</CardTitle>
        <CardDescription>
          {list.length > 1 ? "Quicker, calmer or with fewer changes than the tube all the way." : "Nothing beats the tube for this trip."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {list.map((o) => (
            <li key={o.kind} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {title(o, tube)}
                  {labels.get(o)!.map((label) => (
                    <span key={label} className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {label}
                    </span>
                  ))}
                </p>
                <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  {o.steps.map((step, i) => (
                    <span key={i} className="inline-flex items-center gap-2">
                      {i > 0 && <span aria-hidden>→</span>}
                      <StepText step={step} />
                    </span>
                  ))}
                </p>
                <p className="text-xs">
                  {o.crowding ? CROWDING[o.crowding] : "no crowds"}
                  {o.changes > 0 && ` · ${o.changes} change${o.changes > 1 ? "s" : ""}`}
                  {o.fullDoors && " · some trains too full to get on"}
                </p>
              </div>
              <p className="text-lg font-semibold whitespace-nowrap tabular-nums">{o.minutes} min</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          {liveBikes ? "Santander Cycle options use live bikes and free spaces right now. " : "Live bike data isn't available, so hire-bike options are left out. "}
          Cycling assumes 15 km/h on a hire bike and 18 km/h on your own; walking 4.8 km/h, on roads about 30% longer than a straight line.
        </p>
      </CardContent>
    </Card>
  );
}
