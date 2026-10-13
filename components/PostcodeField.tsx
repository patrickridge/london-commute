"use client";

import { MapPin, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lookupPostcode, nearestStations, type Place, POSTCODE } from "@/lib/places";

type Stations = Record<string, [string, number, number]>;

type Props = {
  id: "from" | "to";
  place: Place | null;
  station: string;
  stations: Stations;
  onPlace: (place: Place | null, station?: string) => void;
  onStation: (station: string) => void;
};

/** Start or end at a postcode instead of a station: picks the nearest station and offers others. */
export function PostcodeField({ id, place, station, stations, onPlace, onStation }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (place) {
    const near = nearestStations(stations, place);
    return (
      <div className="space-y-1.5 text-xs">
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="size-3.5" />
          {id === "from" ? "From" : "To"} <span className="font-medium text-foreground">{place.postcode}</span>, walking {id === "from" ? "to" : "from"} the station
          <button type="button" className="ml-auto rounded p-0.5 hover:bg-muted" aria-label="Remove postcode" onClick={() => onPlace(null)}>
            <X className="size-3.5" />
          </button>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {near.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => onStation(s.name)}
              className={`rounded-full border px-2 py-0.5 ${s.name === station ? "border-foreground bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`}
            >
              {s.name} · {Math.round(s.minutes)} min
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={() => setOpen(true)}>
        Use a postcode instead
      </button>
    );
  }

  const find = async () => {
    if (!POSTCODE.test(text.trim())) {
      setError("That doesn't look like a full postcode.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const found = await lookupPostcode(text);
      const near = found ? nearestStations(stations, found) : [];
      if (!found) setError("Couldn't find that postcode.");
      else if (!near.length) setError("No station within a 25-minute walk.");
      else {
        onPlace(found, near[0].name);
        setOpen(false);
        setText("");
      }
    } catch {
      setError("Couldn't look that up just now. Try again in a moment.");
    }
    setBusy(false);
  };

  return (
    <form
      className="space-y-1"
      onSubmit={(e) => {
        e.preventDefault();
        find();
      }}
    >
      <div className="flex gap-2">
        <Input id={`${id}-postcode`} aria-label="Postcode" placeholder="e.g. SW12 9AB" value={text} onChange={(e) => setText(e.target.value)} autoComplete="postal-code" className="h-8" />
        <Button type="submit" size="sm" variant="outline" disabled={busy || !text.trim()}>
          {busy ? "Finding…" : "Find"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
