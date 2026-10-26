import {
  expect,
  test as base,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

/** Test-only values matching `playwright.config.ts`; not real credentials. */
export const E2E_PASSWORD = "e2e-only-password";
const ORIGIN = "http://localhost:3100";

export type DevUsername = "reviewer" | "viewer" | "main-reviewer";

/** Signs in through the real Auth.js credentials endpoint (with its CSRF token). */
export async function signIn(request: APIRequestContext, username: DevUsername) {
  const csrf = (await (await request.get("/api/auth/csrf")).json()) as { csrfToken: string };
  const response = await request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrf.csrfToken,
      username,
      password: E2E_PASSWORD,
      callbackUrl: "/approvals",
      json: "true",
    },
  });
  expect(response.ok()).toBe(true);
}

type ControlTarget = "reset" | "actions" | "detail" | "decision";

/** Drives the server-side mock backend (scenarios, state reset). */
export async function mockControl(
  request: APIRequestContext,
  target: ControlTarget,
  scenario?: { kind: string; delayMs?: number },
) {
  const response = await request.post("/api/mock-control", {
    headers: { origin: ORIGIN },
    data: { target, scenario },
  });
  expect(response.ok()).toBe(true);
}

/** `test` whose browser context is signed in as `reviewer` with fresh mock state. */
export const test = base.extend({
  context: async ({ context }, provide) => {
    await signIn(context.request, "reviewer");
    await mockControl(context.request, "reset");
    await provide(context);
  },
});

export { expect };
export type { Page };
