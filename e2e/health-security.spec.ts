import { expect, test } from "@playwright/test";

test("health endpoints distinguish liveness from mock readiness", async ({
  request,
}) => {
  const live = await request.get("/api/health/live");
  expect(live.status()).toBe(200);
  expect(live.headers()["x-request-id"]).toMatch(/^req_[\w-]+$/);
  expect(await live.json()).toEqual({ status: "ok" });

  const ready = await request.get("/api/health/ready");
  expect(ready.status()).toBe(200);
  expect(ready.headers()["cache-control"]).toContain("no-store");
  expect(await ready.json()).toMatchObject({
    status: "ready",
    mode: "mock",
    checks: { backend: "mock" },
  });
});

test("HTML responses include browser security headers", async ({ page }) => {
  const response = await page.goto("/login");
  expect(response).not.toBeNull();
  const headers = response!.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});
