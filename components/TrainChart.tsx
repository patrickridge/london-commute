"use client";

import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { SLOT_MINUTES, slotLabel, type Train } from "@/lib/seats";

const config = { people: { label: "People on the train", color: "var(--chart-1)" } } satisfies ChartConfig;
const FIRST_SLOT = 20; // 05:00, when the first trains run

export function TrainChart(props: { people: (number | null)[]; train: Train; slot: number; title: string; description: string }) {
  const data = props.people.slice(FIRST_SLOT).map((people, i) => ({
    hour: ((FIRST_SLOT + i) * SLOT_MINUTES) / 60,
    label: slotLabel(FIRST_SLOT + i),
    people,
  }));
  const peak = Math.max(props.train.capacity, ...data.map((d) => d.people ?? 0));
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
            <YAxis domain={[0, Math.ceil((peak * 1.1) / 250) * 250]} tickCount={5} allowDecimals={false} tickLine={false} axisLine={false} width={40} />
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
              y={props.train.capacity}
              stroke="#dc2626"
              strokeDasharray="4 4"
              label={{ value: "Crush capacity", position: "insideTopLeft", fill: "#dc2626", fontSize: 12 }}
            />
            <Area dataKey="people" type="monotone" stroke="var(--color-people)" fill="var(--color-people)" fillOpacity={0.12} strokeWidth={2} connectNulls />
            {now != null && <ReferenceDot x={(props.slot * SLOT_MINUTES) / 60} y={now} r={5} fill="var(--foreground)" stroke="white" strokeWidth={2} />}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
