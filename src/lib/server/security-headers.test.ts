import { describe, expect, it } from "vitest";
import { getSecurityHeaders } from "./security-headers";

describe("security headers", () => {
  it("applies baseline browser protections and a same-origin CSP", () => {
    const headers = Object.fromEntries(
      getSecurityHeaders({
        nodeEnv: "development",
        appUrl: "http://localhost:3000",
      }).map(({ key, value }) => [key, value]),
    );
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("connect-src 'self'");
    expect(headers).not.toHaveProperty("Strict-Transport-Security");
  });

  it("enables HSTS and insecure-request upgrades only for HTTPS production", () => {
    const headers = Object.fromEntries(
      getSecurityHeaders({
        nodeEnv: "production",
        appUrl: "https://console.example.com",
      }).map(({ key, value }) => [key, value]),
    );
    expect(headers["Strict-Transport-Security"]).toBe(
      "max-age=31536000",
    );
    expect(headers["Content-Security-Policy"]).toContain(
      "upgrade-insecure-requests",
    );
  });

  it("does not enable HSTS for an HTTP production origin", () => {
    const headers = getSecurityHeaders({
      nodeEnv: "production",
      appUrl: "http://localhost:3000",
    });
    expect(headers.some(({ key }) => key === "Strict-Transport-Security")).toBe(
      false,
    );
  });
});
