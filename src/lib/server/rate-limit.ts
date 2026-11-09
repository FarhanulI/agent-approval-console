const RATE_LIMIT_KEY = Symbol.for("agent-approval-console.rate-limits");
const MAX_BUCKETS = 10_000;

type Bucket = { count: number; resetAt: number };
type RateLimitStore = Map<string, Bucket>;
type RateLimitHolder = { [RATE_LIMIT_KEY]?: RateLimitStore };

const holder = globalThis as unknown as RateLimitHolder;

function store(): RateLimitStore {
  holder[RATE_LIMIT_KEY] ??= new Map();
  return holder[RATE_LIMIT_KEY];
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** Process-local fixed-window limit; callers must use trusted identity keys. */
export function consumeRateLimit(
  key: string,
  options: { limit: number; windowMs: number; now?: number },
): RateLimitResult {
  const now = options.now ?? Date.now();
  const buckets = store();
  let bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + options.windowMs };
    buckets.set(key, bucket);
  }

  if (bucket.count >= options.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  if (buckets.size > MAX_BUCKETS) {
    for (const [bucketKey, entry] of buckets) {
      if (now >= entry.resetAt) buckets.delete(bucketKey);
    }
    while (buckets.size > MAX_BUCKETS) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
  }
  return { allowed: true };
}

export function resetRateLimits(): void {
  store().clear();
}
