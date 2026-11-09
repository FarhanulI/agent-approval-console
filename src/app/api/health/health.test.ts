import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as live } from "./live/route";
import { GET as ready } from "./ready/route";
import { TEST_AUTH_SECRET } from "@/test/auth-helpers";

afterEach(() => vi.unstubAllEnvs());

describe("health endpoints", () => {
  it("reports liveness without claiming backend readiness", async () => {
    const response = live(new Request("http://localhost/api/health/live", {
      headers: { "x-request-id": "req_health123" },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("req_health123");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("reports explicitly enabled mock mode as mock readiness", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
    vi.stubEnv("AUTH_DEV_PASSWORD", "test-only-password");
    vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "enabled");

    const response = ready(new Request("http://localhost/api/health/ready"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ready",
      mode: "mock",
      checks: { configuration: "ok", backend: "mock" },
    });
  });

  it("returns sanitized not-ready status when configuration or bridge backend is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("AUTH_DEV_PASSWORD", "");
    vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "");
    vi.stubEnv("ALLOW_MOCK_BACKEND_IN_PRODUCTION", "");

    const response = ready(new Request("http://localhost/api/health/ready"));
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(body).toContain('"status":"not_ready"');
    expect(body).toContain('"mode":"bridge-unavailable"');
    expect(body).not.toContain("AUTH_SECRET");
  });

  it("does not enable mock readiness in production without explicit server consent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
    vi.stubEnv("AUTH_DEV_PASSWORD", "test-only-password");
    vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "enabled");
    vi.stubEnv("ALLOW_MOCK_BACKEND_IN_PRODUCTION", "");

    const response = ready(new Request("http://localhost/api/health/ready"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "not_ready",
      mode: "bridge-unavailable",
    });
  });

  it("fails readiness when OIDC values are only partially configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
    vi.stubEnv("AUTH_DEV_PASSWORD", "test-only-password");
    vi.stubEnv("AUTH_OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("AUTH_OIDC_CLIENT_ID", "");
    vi.stubEnv("AUTH_OIDC_CLIENT_SECRET", "");
    vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "enabled");

    const response = ready(new Request("http://localhost/api/health/ready"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "not_ready",
      mode: "mock",
      checks: { configuration: "unavailable" },
    });
  });
});
