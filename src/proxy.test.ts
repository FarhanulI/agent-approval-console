import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { REVIEWER_BOTH, sessionCookie, setTestEnv } from "@/test/auth-helpers";
import { proxy } from "./proxy";

beforeEach(() => setTestEnv(vi));
afterEach(() => vi.unstubAllEnvs());

const req = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} });

describe("AUTH-001 proxy first layer", () => {
  it("redirects unauthenticated page requests to /login with a safe callbackUrl", async () => {
    const response = await proxy(req("/approvals/act_0001?x=1"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toBe("/approvals/act_0001?x=1");
  });

  it("returns structured 401 JSON (not a redirect) for API requests", async () => {
    const response = await proxy(req("/api/actions"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthenticated" } });
  });

  it("keeps /login and Auth.js routes public (no redirect loop)", async () => {
    for (const path of ["/login", "/api/auth/csrf", "/api/auth/callback/credentials"]) {
      const response = await proxy(req(path));
      expect(response.headers.get("location")).toBeNull();
      expect(response.status).toBe(200);
    }
  });

  it("lets a valid session through and rejects an expired one", async () => {
    expect((await proxy(req("/approvals", await sessionCookie(REVIEWER_BOTH)))).headers.get("location")).toBeNull();
    const expired = await proxy(req("/approvals", await sessionCookie(REVIEWER_BOTH, { maxAge: -120 })));
    expect(expired.status).toBe(307);
  });
});
