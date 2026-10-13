// Where alert sign-ups are kept: Upstash Redis when it's connected (the Vercel Marketplace
// integration sets KV_REST_API_URL and KV_REST_API_TOKEN), otherwise memory, for local development.
// A sign-up holds a browser's push subscription and a commute; nothing that identifies a person.

import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import type { PushSubscription } from "web-push";

import type { Commute } from "./alerts";

export interface Subscriber {
  id: string;
  subscription: PushSubscription;
  commute: Commute;
  /** London date of the last alert, "YYYY-MM-DD" */
  lastSent: string | null;
}

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;
const memory = new Map<string, Subscriber>();

const INDEX = "alerts";
const key = (id: string) => `alert:${id}`;

/** A stable ID for a browser, from its push endpoint. */
export const idFor = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex").slice(0, 24);

export const storeConnected = () => redis !== null;

export async function save(s: Subscriber) {
  if (!redis) return void memory.set(s.id, s);
  await redis.set(key(s.id), s);
  await redis.sadd(INDEX, s.id);
}

export async function find(id: string): Promise<Subscriber | null> {
  if (!redis) return memory.get(id) ?? null;
  return redis.get<Subscriber>(key(id));
}

export async function remove(id: string) {
  if (!redis) return void memory.delete(id);
  await redis.del(key(id));
  await redis.srem(INDEX, id);
}

export async function all(): Promise<Subscriber[]> {
  if (!redis) return [...memory.values()];
  const ids = await redis.smembers(INDEX);
  if (!ids.length) return [];
  const found = await redis.mget<(Subscriber | null)[]>(...ids.map(key));
  return found.filter((s): s is Subscriber => s !== null);
}
