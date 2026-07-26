/**
 * Minimal in-memory rate limiter to protect the Gemini API quota/cost from being burned
 * through by a single user spamming requests (accidentally or on purpose).
 *
 * Tracks a short "burst" window (per minute) and a daily cap per user, both configurable
 * via env vars so limits can be tuned without a code change.
 *
 * NOTE: state lives in server process memory. That's fine for a single-instance deployment
 * (e.g. one VPS) but resets on restart and won't be shared across multiple instances — if this
 * app ever runs on serverless or behind multiple instances, swap this for a shared store
 * (e.g. Redis) instead.
 */

interface RateLimitEntry {
  minuteWindowStart: number;
  minuteCount: number;
  dayWindowStart: number;
  dayCount: number;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;

export interface RateLimitResult {
  allowed: boolean;
  reason?: "minute" | "day";
  retryAfterSeconds?: number;
}

/** Creates an independent rate limiter (its own in-memory store) with the given limits. */
export function createRateLimiter(maxPerMinute: number, maxPerDay: number) {
  const store = new Map<string, RateLimitEntry>();

  /** Checks and (if allowed) consumes one request from the given key's rate limit budget. */
  return function check(key: string): RateLimitResult {
    const now = Date.now();
    let entry = store.get(key);
    if (!entry) {
      entry = { minuteWindowStart: now, minuteCount: 0, dayWindowStart: now, dayCount: 0 };
      store.set(key, entry);
    }

    if (now - entry.minuteWindowStart >= MINUTE_MS) {
      entry.minuteWindowStart = now;
      entry.minuteCount = 0;
    }
    if (now - entry.dayWindowStart >= DAY_MS) {
      entry.dayWindowStart = now;
      entry.dayCount = 0;
    }

    if (entry.dayCount >= maxPerDay) {
      return {
        allowed: false,
        reason: "day",
        retryAfterSeconds: Math.ceil((entry.dayWindowStart + DAY_MS - now) / 1000),
      };
    }
    if (entry.minuteCount >= maxPerMinute) {
      return {
        allowed: false,
        reason: "minute",
        retryAfterSeconds: Math.ceil((entry.minuteWindowStart + MINUTE_MS - now) / 1000),
      };
    }

    entry.minuteCount += 1;
    entry.dayCount += 1;
    return { allowed: true };
  };
}

const analyzeLimiter = createRateLimiter(
  Number(process.env.ANALYZE_RATE_LIMIT_PER_MINUTE) || 5,
  Number(process.env.ANALYZE_RATE_LIMIT_PER_DAY) || 30,
);

/** Rate limit for `/api/analyze` (photo analysis — the most expensive Gemini call). */
export function checkRateLimit(key: string): RateLimitResult {
  return analyzeLimiter(key);
}

const estimateLimiter = createRateLimiter(
  Number(process.env.ESTIMATE_RATE_LIMIT_PER_MINUTE) || 20,
  Number(process.env.ESTIMATE_RATE_LIMIT_PER_DAY) || 150,
);

/** Rate limit for `/api/estimate-calories` (cheap text-only call, so a higher budget). */
export function checkEstimateRateLimit(key: string): RateLimitResult {
  return estimateLimiter(key);
}
