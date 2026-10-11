# London commute planner

[![CI](https://github.com/patrickridge/london-commute/actions/workflows/ci.yml/badge.svg)](https://github.com/patrickridge/london-commute/actions/workflows/ci.yml)

Live site: https://london-commute-planner.vercel.app

Pick two stations and a time. The planner shows how long the journey takes, whether you'll get a seat on each part of it, and whether a Santander Cycle or your own bike would be quicker.

<img src="docs/screenshot.jpg" alt="Waterloo to Liverpool Street: a seat on both legs, 12 minutes by tube, 16 by hire bike" width="720">

## Why

When I moved to London I wanted to know three things about my commute: how long it would take, whether I'd get a seat, and whether cycling would be better. Journey planners answer the first. TfL publishes the data for the other two, but not in a form anyone reads before leaving the house.

## How it works

**How full your train is.** TfL's NUMBAT dataset (2025) estimates, for a typical day, how many people travel on every stretch of the Underground and Elizabeth line in each 15-minute band, and how many trains run. Dividing one by the other gives the average number of people on each train, which is compared with its seats and total capacity (from TfL's rolling stock information sheets):

| People per train | Answer |
|---|---|
| under 80% of seats | probably a seat |
| 80–110% of seats | might get a seat |
| over 110% of seats | you'll stand |
| over 90% of capacity | very crowded |

The cut-offs are my own judgement: the figures are averages over the whole train, and the ends of a train are usually emptier than the middle.

Capacity is TfL's crush figure: everyone standing, packed tight. In practice people stop moving down long before that, so a train can be too full by the doors to get on while the average is only just over half of it. From 55% of capacity the planner warns that some trains may be too full to board, and the chart labels the line "Crush capacity" rather than "Full".

**Your route.** Each line is a set of one-way links between stations, joined where stations share a name. Dijkstra's algorithm finds the route with the fewest stops, with a change of line costing four stops, and leaves out lines with no trains around your time. Half-hourly lines leave empty 15-minute bands, so a band with no train uses the next one.

**Journey time.** From TfL's Journey Planner, station to station. If it's unavailable, the page falls back to a rough estimate (2 minutes a stop, 5 a change).

**Tube or bike.** TfL's BikePoint API gives live counts of bikes, e-bikes and free spaces at all ~800 Santander Cycles docks. The planner finds docks within a 6-minute walk (500 m) of each station, takes the nearest with a bike and the nearest with a free space, and adds walk + ride + walk. Riding assumes 15 km/h on a hire bike and 18 km/h on your own, on roads about 30% longer than a straight line.

## Where the data comes from

The network data in `public/data/` is built by a Python pipeline in [tube-crowding](https://github.com/patrickridge/tube-crowding), which also has the data-quality notes and an earlier Streamlit version. The route planner and seat levels here are a TypeScript port of that code, and `lib/seats.test.ts` checks that both versions give the same answer for 300 random journeys.

Journey answers are worked out in the browser from one day's data file (about 90 KB). Only the live parts go through the server, in `app/api/live/route.ts`, so the TfL key stays private.

## Limitations

- Typical days only: no strikes, delays or events.
- Averages over the whole train. Some carriages will be fuller than others.
- Underground and Elizabeth line only. Metropolitan line fast trains aren't included.
- Bike and space counts are live, so they only tell you about right now.
- Santander Cycles cover central and inner London; many outer stations have no dock nearby. Lime and other dockless bikes don't publish open data for London.

## Running it locally

Needs Node 24.

```bash
npm install
cp .env.example .env.local   # optional: add a free key from api-portal.tfl.gov.uk
npm run dev
```

Then open http://localhost:3000.

## Checks

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

GitHub Actions runs all four on every push.

## Code layout

```
lib/seats.ts              Route planning and seat levels (no UI)
lib/bikes.ts              Nearby docks and bike times (no UI)
lib/tfl.ts                Server-side calls to TfL, cached
app/api/live/route.ts     Live tube time and bikes for a journey
components/Planner.tsx    The planner
components/TrainChart.tsx How full the first train is through the day
public/data/              Stations and per-day train loads, exported from tube-crowding
```

Built with Next.js, TypeScript, Tailwind CSS, shadcn/ui and Recharts.

## What I'd do next

1. Predict bikes and spaces at a dock for a chosen time, from logged dock history.
2. The Overground and DLR, which are in the same TfL dataset.
3. Live line status next to the journey, so disruption shows up.

## Data and licence

Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016 and Geomni UK Map data © and database rights [2019]. Used under TfL's [transport data terms](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service). Train capacities from TfL's rolling stock information sheets. Not affiliated with TfL.

The code is MIT licensed (see [LICENSE](LICENSE)).
