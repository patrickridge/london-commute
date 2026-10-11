"use client";

import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { DOORS_FULL, SLOT_MINUTES, slotLabel, type Train } from "@/lib/seats";

const config = { people: { label: "People on the train", color: "var(--chart-1)" } } satisfies ChartConfig;
const FIRST_SLOT = 20; // 05:00, when the first trains run

export function TrainChart(props: { people: (number | null)[]; train: Train; slot: number; title: string; description: string }) {
  const data = props.people.slice(FIRST_SLOT).map((people, i) => ({
    hour: ((FIRST_SLOT + i) * SLOT_MINUTES) / 60,
    label: slotLabel(FIRST_SLOT + i),
    people,
  }));
  // Where trains start to be too full by the doors to get on (see hardToBoard in lib/seats.ts).
  const doorsFull = Math.round(DOORS_FULL * props.train.capacity);
  const peak = Math.max(doorsFull, ...data.map((d) => d.people ?? 0));
  // Even steps on the people axis, with some headroom above the busiest point.
  const step = peak > 900 ? 250 : peak > 450 ? 200 : 100;
  const top = Math.ceil((peak * 1.1) / step) * step;
  const yTicks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const now = props.people[props.slot];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          <AreaChart data={data} margin={{ left: 4, right: 12, top: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="hour"
              type="number"
              domain={[5, 24]}
              ticks={[6, 9, 12, 15, 18, 21, 24]}
              tickFormatter={(h: number) => `${String(h % 24).padStart(2, "0")}:00`}
              tickLine={false}
              axisLine={false}
            />
            <YAxis domain={[0, top]} ticks={yTicks} tickLine={false} axisLine={false} width={40} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => String(payload?.[0]?.payload?.label ?? "")}
                  formatter={(value) => <span className="font-medium tabular-nums">about {Number(value)} people</span>}
                />
              }
            />
            <ReferenceLine
              y={props.train.seats}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{ value: "Seats", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <ReferenceLine
              y={doorsFull}
              stroke="#d97706"
              strokeDasharray="4 4"
              label={{ value: "May have to wait for the next train", position: "insideTopLeft", fill: "#b45309", fontSize: 12 }}
            />
            <Area dataKey="people" type="monotone" stroke="var(--color-people)" fill="var(--color-people)" fillOpacity={0.12} strokeWidth={2} connectNulls />
            {now != null && <ReferenceDot x={(props.slot * SLOT_MINUTES) / 60} y={now} r={5} fill="var(--foreground)" stroke="white" strokeWidth={2} />}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
