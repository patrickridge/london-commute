"use client";

import { Bell, BellOff, Share } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type Commute, routeName } from "@/lib/alerts";
import type { Route } from "@/lib/seats";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const SAVE_KEY = "alerts";
const DAYS = [
  { day: 1, label: "M", name: "Monday" },
  { day: 2, label: "T", name: "Tuesday" },
  { day: 3, label: "W", name: "Wednesday" },
  { day: 4, label: "T", name: "Thursday" },
  { day: 5, label: "F", name: "Friday" },
  { day: 6, label: "S", name: "Saturday" },
  { day: 0, label: "S", name: "Sunday" },
];

type Saved = { endpoint: string; commutes: Commute[] };
type Support = "unknown" | "yes" | "no" | "add-to-home-screen";

const MAX_COMMUTES = 3;
const sameTrip = (a: Commute, b: { from: string; to: string }) => a.from === b.from && a.to === b.to;

/** "Mon–Fri", "Every day", "Mon, Wed, Fri". */
function dayList(days: number[]) {
  const key = [...days].sort().join("");
  if (key === "12345") return "Mon–Fri";
  if (key === "0123456") return "Every day";
  if (key === "06") return "Weekends";
  return DAYS.filter((d) => days.includes(d.day)).map((d) => d.name.slice(0, 3)).join(", ");
}

/** Push wants the server's public key as bytes. */
function keyBytes(base64url: string) {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function subscription() {
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) ?? registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY!) });
}

function load(): Saved | null {
  try {
    const stored = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null") as (Saved & { commute?: Commute }) | null;
    if (!stored) return null;
    // Saved before several journeys were allowed.
    if (stored.commute) return { endpoint: stored.endpoint, commutes: [stored.commute] };
    return stored.commutes?.length ? stored : null;
  } catch {
    return null;
  }
}

function store(saved: Saved | null) {
  try {
    if (saved) localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
    else localStorage.removeItem(SAVE_KEY);
  } catch {}
}

/** Alerts for up to three regular journeys: a notification before leaving when there are delays or a calmer time. */
/** `route` is the way chosen in the planner; `onUsual` hands back the way saved with an alert, so the planner can show it. */
export function Alerts({ from, to, time, route, onUsual }: { from: string; to: string; time: string; route: Route; onUsual: (route: Route) => void }) {
  const [support, setSupport] = useState<Support>("unknown");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [daily, setDaily] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const iPhone = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    /* eslint-disable react-hooks/set-state-in-effect -- reading browser capabilities and storage after hydration */
    setSupport(capable && (!iPhone || installed) ? "yes" : iPhone && !installed ? "add-to-home-screen" : "no");
    setSaved(load());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Show the settings of the journey on screen, if it already has alerts.
  const current = saved?.commutes.find((c) => sameTrip(c, { from, to }));
  useEffect(() => {
    if (!current) return;
    /* eslint-disable react-hooks/set-state-in-effect -- following the journey on screen */
    setDays(current.days);
    setDaily(current.mode === "daily");
    if (current.route) onUsual(current.route);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Only when the saved alert changes, not on every new `onUsual`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!PUBLIC_KEY || support === "unknown" || support === "no") return null;

  const commute: Commute = { from, to, time, days, mode: daily ? "daily" : "issues", route };
  const full = !current && (saved?.commutes.length ?? 0) >= MAX_COMMUTES;

  const turnOn = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setMessage("Notifications are blocked for this site. Allow them in your settings, then try again.");
        return;
      }
      const sub = (await subscription()).toJSON();
      const res = await fetch("/api/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub, commute }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't turn alerts on");
      const next = { endpoint: sub.endpoint!, commutes: body.commutes as Commute[] };
      store(next);
      setSaved(next);
      setMessage(current ? "Updated." : "Alerts are on. Send a test to check they arrive.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't turn alerts on.");
    } finally {
      setBusy(false);
    }
  };

  const removeOne = async (c: Commute) => {
    setBusy(true);
    try {
      await fetch("/api/alerts", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: saved!.endpoint, from: c.from, to: c.to }) });
    } catch {}
    const commutes = saved!.commutes.filter((x) => !sameTrip(x, c));
    if (!commutes.length) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        await (await registration?.pushManager.getSubscription())?.unsubscribe();
      } catch {}
    }
    const next = commutes.length ? { ...saved!, commutes } : null;
    store(next);
    setSaved(next);
    setMessage(next ? undefined : "Alerts are off.");
    setBusy(false);
  };

  const test = async (c: Commute) => {
    setBusy(true);
    const res = await fetch("/api/alerts/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: saved!.endpoint, from: c.from, to: c.to }) }).catch(() => null);
    setMessage(res?.ok ? "Test sent. It should arrive in a few seconds." : "Couldn't send a test. Try removing the alert and adding it again.");
    setBusy(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4" />
          Commute alerts
        </CardTitle>
        <CardDescription>
          A notification shortly before you leave, only when it matters: delays on your lines and what to do instead, or a calmer time to go.
          Up to {MAX_COMMUTES} journeys, say there and back.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {support === "add-to-home-screen" ? (
          <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
            <Share className="mt-0.5 size-4 shrink-0" />
            <span>
              On iPhone, alerts work from the home screen app. Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>, open the planner from
              there and turn alerts on.
            </span>
          </p>
        ) : (
          <>
            {saved && (
              <ul className="divide-y rounded-lg border text-sm">
                {saved.commutes.map((c) => (
                  <li key={`${c.from}>${c.to}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>
                      <span className="font-medium">
                        {c.from} to {c.to}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {c.time} · {dayList(c.days)}
                        {c.mode === "daily" ? " · every time" : ""}
                      </span>
                      {c.route && <span className="block text-xs text-muted-foreground">{routeName(c.route)}</span>}
                    </span>
                    <span className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => test(c)} disabled={busy}>
                        Send a test
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeOne(c)} disabled={busy} aria-label={`Remove alerts for ${c.from} to ${c.to}`}>
                        <BellOff />
                        Remove
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1" role="group" aria-label="Days to check">
                {DAYS.map((d) => {
                  const on = days.includes(d.day);
                  return (
                    <button
                      key={d.day}
                      type="button"
                      aria-pressed={on}
                      aria-label={d.name}
                      onClick={() => setDays(on ? days.filter((x) => x !== d.day) : [...days, d.day])}
                      className={`size-8 rounded-full text-xs font-medium ${on ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} className="accent-primary" />
                Also on good days
              </label>
            </div>
            <Button onClick={turnOn} disabled={busy || !days.length || full}>
              <Bell />
              {current ? `Update ${from} to ${to}` : `Alert me for the ${time} ${from} to ${to}`}
            </Button>
            {full && <p className="text-sm text-muted-foreground">You have alerts for {MAX_COMMUTES} journeys. Remove one to add this.</p>}
            {!full && (
              <p className="text-sm text-muted-foreground">
                {!saved
                  ? "Allow notifications when asked, then send a test to check they arrive. Alerts are saved on this device."
                  : current
                    ? "To change this journey's time, days or route, set them above and tap Update. To add another, such as the way home, change the stations."
                    : "To add another journey, such as the way home, change the stations or time above and tap Alert me."}
              </p>
            )}
          </>
        )}
        {message && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
