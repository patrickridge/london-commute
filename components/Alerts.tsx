"use client";

import { Bell, BellOff, Share } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Commute } from "@/lib/alerts";

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

type Saved = { endpoint: string; commute: Commute };
type Support = "unknown" | "yes" | "no" | "add-to-home-screen";

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

/** Turn on alerts for the journey on screen: a notification before leaving when there are delays or a calmer time. */
export function Alerts({ from, to, time }: { from: string; to: string; time: string }) {
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
    try {
      const stored = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null") as Saved | null;
      if (stored) {
        setSaved(stored);
        setDays(stored.commute.days);
        setDaily(stored.commute.mode === "daily");
      }
    } catch {}
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  if (!PUBLIC_KEY || support === "unknown" || support === "no") return null;

  const commute: Commute = { from, to, time, days, mode: daily ? "daily" : "issues" };
  const onForThis = saved && saved.commute.from === from && saved.commute.to === to && saved.commute.time === time;

  const turnOn = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setMessage("Notifications are blocked for this site. Allow them in your browser's settings, then try again.");
        return;
      }
      const sub = (await subscription()).toJSON();
      const res = await fetch("/api/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub, commute }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't turn alerts on");
      const next = { endpoint: sub.endpoint!, commute };
      localStorage.setItem(SAVE_KEY, JSON.stringify(next));
      setSaved(next);
      setMessage("Alerts are on. Send a test to check they arrive.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't turn alerts on.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await fetch("/api/alerts", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: saved!.endpoint }) });
      const registration = await navigator.serviceWorker.getRegistration();
      await (await registration?.pushManager.getSubscription())?.unsubscribe();
    } catch {}
    localStorage.removeItem(SAVE_KEY);
    setSaved(null);
    setMessage("Alerts are off.");
    setBusy(false);
  };

  const test = async () => {
    setBusy(true);
    const res = await fetch("/api/alerts/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: saved!.endpoint }) }).catch(() => null);
    setMessage(res?.ok ? "Test sent. It should arrive in a few seconds." : "Couldn't send a test. Try turning alerts off and on again.");
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
          A notification about 30 minutes before you leave, only when it matters: delays on your lines, or a calmer time to go.
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
            {saved && !onForThis && (
              <p className="text-sm text-muted-foreground">
                Alerts are on for {saved.commute.from} to {saved.commute.to} at {saved.commute.time}.
              </p>
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
            <div className="flex flex-wrap gap-2">
              <Button onClick={turnOn} disabled={busy || !days.length}>
                <Bell />
                {onForThis ? "Update alerts" : saved ? `Switch alerts to this journey` : `Alert me for the ${time}`}
              </Button>
              {saved && (
                <>
                  <Button variant="outline" onClick={test} disabled={busy}>
                    Send a test
                  </Button>
                  <Button variant="ghost" onClick={turnOff} disabled={busy}>
                    <BellOff />
                    Turn off
                  </Button>
                </>
              )}
            </div>
          </>
        )}
        {message && <p className="text-sm text-muted-foreground" aria-live="polite">{message}</p>}
      </CardContent>
    </Card>
  );
}
