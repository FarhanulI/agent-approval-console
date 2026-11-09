import { describe, expect, it } from "vitest";
import { parseOidcConfiguration } from "./oidc-config";

describe("OIDC environment validation", () => {
  it("distinguishes absent from incomplete provider configuration", () => {
    expect(parseOidcConfiguration({})).toEqual({ kind: "absent" });
    expect(
      parseOidcConfiguration({ AUTH_OIDC_ISSUER: "https://idp.example.com" }),
    ).toEqual({ kind: "incomplete" });
  });

  it("accepts HTTPS issuer configuration without exposing invalid values", () => {
    const result = parseOidcConfiguration({
      AUTH_OIDC_ISSUER: "https://idp.example.com",
      AUTH_OIDC_CLIENT_ID: "console",
      AUTH_OIDC_CLIENT_SECRET: "server-only-secret",
    });
    expect(result.kind).toBe("configured");
  });

  it.each([
    "http://idp.example.com",
    "https://user:password@idp.example.com",
    "https://idp.example.com?unexpected=true",
    "https://idp.example.com#unexpected",
    "not-a-url",
  ])("rejects an unsafe or invalid issuer without returning its values: %s", (issuer) => {
    const result = parseOidcConfiguration({
      AUTH_OIDC_ISSUER: issuer,
      AUTH_OIDC_CLIENT_ID: "console",
      AUTH_OIDC_CLIENT_SECRET: "server-only-secret",
    });
    expect(result).toEqual({ kind: "invalid" });
    expect(JSON.stringify(result)).not.toContain("server-only-secret");
  });

  it("allows a loopback HTTP issuer for local development", () => {
    expect(
      parseOidcConfiguration({
        AUTH_OIDC_ISSUER: "http://localhost:8080",
        AUTH_OIDC_CLIENT_ID: "console",
        AUTH_OIDC_CLIENT_SECRET: "dev-secret",
      }).kind,
    ).toBe("configured");
  });

  it("rejects a loopback HTTP issuer in production", () => {
    expect(
      parseOidcConfiguration(
        {
          AUTH_OIDC_ISSUER: "http://localhost:8080",
          AUTH_OIDC_CLIENT_ID: "console",
          AUTH_OIDC_CLIENT_SECRET: "production-secret",
        },
        "production",
      ),
    ).toEqual({ kind: "invalid" });
  });
});
