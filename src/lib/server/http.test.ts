import { describe, expect, it } from "vitest";
import { getRequestId, readBoundedBody, tooManyRequests } from "./http";

describe("request-boundary helpers", () => {
  it("uses only well-formed request IDs and generates a fallback otherwise", () => {
    expect(getRequestId(new Request("http://localhost", { headers: { "x-request-id": "req_valid-123" } }))).toBe(
      "req_valid-123",
    );
    expect(getRequestId(new Request("http://localhost", { headers: { "x-request-id": "not.valid!" } }))).toMatch(
      /^req_[\w-]+$/,
    );
  });

  it("rejects oversized content before parsing and bounds streamed bytes", async () => {
    const declaredTooLarge = new Request("http://localhost", {
      method: "POST",
      headers: { "content-length": "11" },
      body: "01234567890",
    });
    expect(await readBoundedBody(declaredTooLarge, 10)).toEqual({
      ok: false,
      reason: "too_large",
    });

    const streamedTooLarge = new Request("http://localhost", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("123456"));
          controller.enqueue(new TextEncoder().encode("78901"));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
    expect(await readBoundedBody(streamedTooLarge, 10)).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("accepts a body within the byte limit, including multibyte UTF-8", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: "café",
    });
    expect(await readBoundedBody(request, 5)).toEqual({ ok: true, text: "café" });
  });

  it("returns an explicit 429 and retry-after header", async () => {
    const response = tooManyRequests("req_test123", 12);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("12");
    expect(await response.json()).toMatchObject({
      error: { code: "rate_limited", requestId: "req_test123" },
    });
  });
});
