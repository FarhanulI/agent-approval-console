import { env } from "./env";
import { parseOidcConfiguration } from "@/lib/auth/oidc-config";
import { isMockModeEnabled } from "./mock-mode";

export type ReadinessSnapshot = {
  ready: boolean;
  mode: "mock" | "bridge-unavailable";
  configurationReady: boolean;
  backendReady: boolean;
};

export function getReadinessSnapshot(): ReadinessSnapshot {
  const mockMode = isMockModeEnabled();
  const authSecret = process.env.AUTH_SECRET;
  const oidc = parseOidcConfiguration({
    AUTH_OIDC_ISSUER: process.env.AUTH_OIDC_ISSUER,
    AUTH_OIDC_CLIENT_ID: process.env.AUTH_OIDC_CLIENT_ID,
    AUTH_OIDC_CLIENT_SECRET: process.env.AUTH_OIDC_CLIENT_SECRET,
  });
  const appUrl = new URL(env.APP_URL);
  const isLocalOrigin = ["localhost", "127.0.0.1", "[::1]"].includes(
    appUrl.hostname,
  );
  const httpsRequired =
    process.env.NODE_ENV === "production" &&
    appUrl.protocol !== "https:" &&
    !isLocalOrigin;
  const loginConfigured =
    oidc.kind === "configured" ||
    (mockMode && Boolean(process.env.AUTH_DEV_PASSWORD));
  const configurationReady =
    Boolean(authSecret && authSecret.trim().length >= 32) &&
    oidc.kind !== "incomplete" &&
    oidc.kind !== "invalid" &&
    loginConfigured &&
    !httpsRequired;
  const backendReady = mockMode;

  return {
    ready: configurationReady && backendReady,
    mode: mockMode ? "mock" : "bridge-unavailable",
    configurationReady,
    backendReady,
  };
}
