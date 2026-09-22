import "server-only";
import { Redis } from "@upstash/redis";

// Accept either the Vercel KV marketplace names or plain Upstash names.
function pick(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return undefined;
}

const url = pick("KV_REST_API_URL", "UPSTASH_REDIS_REST_URL");
const token = pick("KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN");

/** Whether a Redis backend is configured in this environment. */
export const kvConfigured = Boolean(url && token);

/** Redis client, or null when no backend is configured (dev / local-only). */
export const redis = kvConfigured ? new Redis({ url: url!, token: token! }) : null;

/** Redis key for a plan space. */
export function planKey(space: string): string {
  return `plan:${space}`;
}

/** Normalize an arbitrary space string to a safe slug. */
export function sanitizeSpace(raw: string | null | undefined): string {
  const v = (raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 64);
  return v || "default";
}

/** Generate a fresh opaque space id (used when creating a new version). */
export function randomSpace(): string {
  return Math.random().toString(36).slice(2, 10);
}
