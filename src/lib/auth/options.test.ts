import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestEnv } from "@/test/auth-helpers";
import { verifyDevCredentials } from "./dev-users";
import { createAuthOptions } from "./options";

beforeEach(() => {
  setTestEnv(vi);
  vi.stubEnv("AUTH_DEV_PASSWORD", "unit-dev-password");
});
afterEach(() => vi.unstubAllEnvs());

describe("dev credentials gating", () => {
  it("accepts only the right user and password in mock mode", () => {
    expect(verifyDevCredentials("reviewer", "unit-dev-password")?.role).toBe("reviewer");
    expect(verifyDevCredentials("reviewer", "wrong")).toBeNull();
    expect(verifyDevCredentials("nobody", "unit-dev-password")).toBeNull();
    expect(verifyDevCredentials(undefined, undefined)).toBeNull();
  });

  it("is unavailable without the mock flag, without a password, or in a production build", () => {
    vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "");
    expect(verifyDevCredentials("reviewer", "unit-dev-password")).toBeNull();
    expect(createAuthOptions().providers).toHaveLength(0);

    setTestEnv(vi);
    vi.stubEnv("AUTH_DEV_PASSWORD", "");
    expect(createAuthOptions().providers).toHaveLength(0);

    vi.stubEnv("AUTH_DEV_PASSWORD", "unit-dev-password");
    vi.stubEnv("NODE_ENV", "production");
    expect(createAuthOptions().providers).toHaveLength(0);
  });
});

describe("Auth.js configuration", () => {
  it("uses a JWT session with a bounded lifetime and no providers by default", () => {
    vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "");
    const options = createAuthOptions();
    expect(options.session?.strategy).toBe("jwt");
    expect(options.session?.maxAge).toBeLessThanOrEqual(60 * 60 * 24);
    expect(options.providers).toHaveLength(0);
  });

  it("uses secure cookies when the public origin is https", async () => {
    vi.resetModules();
    vi.stubEnv("APP_URL", "https://console.example.com");
    const { createAuthOptions: create } = await import("./options");
    expect(create().useSecureCookies).toBe(true);
  });

  it("rebuilds the token from validated claims only and rejects invalid ones", async () => {
    const { callbacks } = createAuthOptions();
    const token = await callbacks!.jwt!({
      token: { sub: "x", email: "leak@example.com", picture: "p" },
      user: { id: "u1", name: "N", role: "viewer", tenants: ["t1"], email: "e@x" } as never,
    } as never);
    expect(token).toMatchObject({ sub: "u1", role: "viewer", tenants: ["t1"] });
    expect(token).not.toHaveProperty("email");
    expect(token).not.toHaveProperty("picture");
    await expect(
      Promise.resolve().then(() =>
        callbacks!.jwt!({ token: {}, user: { id: "u1", role: "admin", tenants: ["t1"] } as never } as never),
      ),
    ).rejects.toThrow();
  });

  it("only redirects to same-origin relative destinations", async () => {
    const { callbacks } = createAuthOptions();
    const base = "http://localhost:3000";
    const redirect = (url: string) => callbacks!.redirect!({ url, baseUrl: base });
    expect(await redirect("/approvals/act_0001")).toBe(`${base}/approvals/act_0001`);
    expect(await redirect("https://evil.example/x")).toBe(`${base}/approvals`);
    expect(await redirect("//evil.example")).toBe(`${base}/approvals`);
    expect(await redirect(`${base}/login`)).toBe(`${base}/approvals`);
  });
});

describe("SECURITY-002 secrets are not exposed", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
    });
  }

  it("never references auth secrets through NEXT_PUBLIC_* and never uses web storage", () => {
    const files = sourceFiles(join(process.cwd(), "src"));
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(SECRET|PASSWORD|TOKEN|KEY)/);
      expect(text, file).not.toMatch(/(localStorage|sessionStorage)/);
    }
  });

  it("keeps secret environment variables out of client modules", () => {
    const clientFiles = sourceFiles(join(process.cwd(), "src")).filter((file) =>
      readFileSync(file, "utf8").trimStart().startsWith('"use client"'),
    );
    for (const file of clientFiles) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/AUTH_(SECRET|DEV_PASSWORD|OIDC_CLIENT_SECRET)/);
    }
  });
});
