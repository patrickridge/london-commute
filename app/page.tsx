import Link from "next/link";
import { Suspense } from "react";
import { TrainFront } from "lucide-react";

import { Planner } from "@/components/Planner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const REPO = "https://github.com/patrickridge/london-commute";

const EXPLAINERS = [
  {
    title: "How full your train is",
    body: "TfL counts how many people travel on every stretch of the Underground and Elizabeth line, every 15 minutes. Dividing by the number of trains gives the typical crowd on each train, which is compared with its seats.",
  },
  {
    title: "Your route",
    body: "The planner finds the route with the fewest stops, treating a change of line as costing four stops, and skips lines that aren't running at your time. Tube times come from TfL's Journey Planner.",
  },
  {
    title: "Bike or tube",
    body: "Live counts from every Santander Cycles dock show whether there's a bike within a 6-minute walk of your station and a free space at the other end. Cycling times are estimated from distance.",
  },
];

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold whitespace-nowrap">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <TrainFront className="size-4" />
            </span>
            London commute planner
          </Link>
          <nav className="flex gap-5 text-sm text-muted-foreground">
            <a href="#how-it-works" className="hidden hover:text-foreground sm:inline">
              How it works
            </a>
            <a href={REPO} className="hover:text-foreground">
              Source
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="max-w-2xl">
          <p className="text-sm font-medium text-primary">Underground and Elizabeth line</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Plan your commute</h1>
          <p className="mt-3 text-muted-foreground">
            How long it takes, whether you&apos;ll get a seat, and whether a bike would be quicker. Based on
            TfL&apos;s 2025 passenger counts and live Santander Cycles data.
          </p>
        </section>

        <section className="mt-10">
          <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
            <Planner />
          </Suspense>
        </section>

        <section id="how-it-works" className="mt-20 scroll-mt-20">
          <h2 className="text-xl font-semibold tracking-tight">How it works</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {EXPLAINERS.map((item) => (
              <Card key={item.title}>
                <CardHeader>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{item.body}</CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Typical days only: the figures describe an average autumn day in 2025, not strikes, delays or events, and
            they&apos;re averages over the whole train. &ldquo;Probably a seat&rdquo; means under 80% of the seats are
            taken; &ldquo;you&apos;ll stand&rdquo; means more people than 110% of the seats.
          </p>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <p>
            Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016 and Geomni UK Map data ©
            and database rights [2019]. A personal project, not affiliated with TfL.
          </p>
          <a href={REPO} className="shrink-0 hover:text-foreground">
            Source on GitHub
          </a>
        </div>
      </footer>
    </>
  );
}
