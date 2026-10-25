// Simple fixed-window limiter. Per-instance only: back it with a shared store
// (e.g. Redis) once the app runs on more than one server instance.
const buckets = new Map<string, { count: number; resetAt: number }>();

function sweep(now: number) {
  if (buckets.size > 10000) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }
}

/** Counts this call and reports whether the caller is over `limit` in the window. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  if (b.count > limit) return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  return { ok: true, retryAfter: 0 };
}

/** Checks a budget without spending it (pair with `recordFailure`). */
export function isLimited(key: string, limit: number) {
  const b = buckets.get(key);
  const now = Date.now();
  if (!b || b.resetAt < now || b.count < limit) return { limited: false, retryAfter: 0 };
  return { limited: true, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
}

/** Spends one unit of a budget, e.g. on a failed sign-in. */
export function recordFailure(key: string, windowMs: number) {
  rateLimit(key, Number.MAX_SAFE_INTEGER, windowMs);
}
