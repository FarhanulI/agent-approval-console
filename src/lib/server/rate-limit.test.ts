import { afterEach, describe, expect, it } from "vitest";
import { consumeRateLimit, resetRateLimits } from "./rate-limit";

afterEach(resetRateLimits);

describe("process-local rate limiting", () => {
  it("allows the configured number of requests and returns a retry delay", () => {
    expect(consumeRateLimit("decision:user-1", { limit: 2, windowMs: 10_000, now: 1_000 })).toEqual({
      allowed: true,
    });
    expect(consumeRateLimit("decision:user-1", { limit: 2, windowMs: 10_000, now: 2_000 })).toEqual({
      allowed: true,
    });
    expect(consumeRateLimit("decision:user-1", { limit: 2, windowMs: 10_000, now: 2_500 })).toEqual({
      allowed: false,
      retryAfterSeconds: 9,
    });
  });

  it("resets expired buckets and keeps identities isolated", () => {
    expect(consumeRateLimit("decision:user-1", { limit: 1, windowMs: 1_000, now: 100 }).allowed).toBe(true);
    expect(consumeRateLimit("decision:user-2", { limit: 1, windowMs: 1_000, now: 100 }).allowed).toBe(true);
    expect(consumeRateLimit("decision:user-1", { limit: 1, windowMs: 1_000, now: 1_100 }).allowed).toBe(true);
  });
});
