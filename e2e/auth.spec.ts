import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E_PASSWORD, mockControl, signIn, type DevUsername } from "./fixtures";

const ORIGIN = "http://localhost:3100";

async function loginViaForm(page: import("@playwright/test").Page, username: DevUsername) {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function actionIds(request: APIRequestContext) {
  const response = await request.get("/api/actions?pageSize=100");
  const body = (await response.json()) as { items: { id: string }[] };
  return body.items.map((item) => item.id);
}

test.describe("authentication journeys", () => {
  test("AUTH-001: protected pages redirect unauthenticated users to login", async ({ page }) => {
    await page.goto("/approvals/act_0001");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fapprovals%2Fact_0001$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("AUTH-002: protected API requests return structured 401", async ({ request }) => {
    for (const path of ["/api/actions", "/api/actions/act_0001"]) {
      const response = await request.get(path);
      expect(response.status()).toBe(401);
      expect((await response.json()).error.code).toBe("unauthenticated");
    }
  });

  test("signs in with the form, returns to the requested page, and signs out", async ({ page }) => {
    await page.goto("/approvals/act_0001");
    await loginViaForm(page, "reviewer");
    await expect(page).toHaveURL(/\/approvals\/act_0001$/);
    await expect(page.getByTestId("session-identity")).toContainText("usr_dev_reviewer · reviewer");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/approvals");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a wrong password does not sign in", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("reviewer");
    await page.getByLabel("Password").fill("wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Sign-in failed")).toBeVisible();
    await page.goto("/approvals");
    await expect(page).toHaveURL(/\/login/);
  });

  test("an external callbackUrl never leaves the origin", async ({ page }) => {
    await page.goto("/login?callbackUrl=https%3A%2F%2Fevil.example%2F");
    await loginViaForm(page, "reviewer");
    await expect(page).toHaveURL(`${ORIGIN}/approvals`);
  });

  test("AUTHZ-001: a viewer sees no decision controls and the API refuses a direct decision", async ({
    page,
  }) => {
    await signIn(page.context().request, "viewer");
    await mockControl(page.context().request, "reset");
    await page.goto("/approvals/act_0001");
    await expect(page.getByRole("heading", { name: "Update credit limit" })).toBeVisible();
    await expect(page.getByTestId("decision-unavailable")).toContainText(/read-only/i);

    const response = await page.context().request.post("/api/actions/act_0001/approve", {
      headers: { origin: ORIGIN, "idempotency-key": "e2e-key-0123456789abcdef" },
      data: { decision: "approve", recordVersion: 1 },
    });
    expect(response.status()).toBe(403);
  });

  test("TENANT-001: a user cannot read or decide another tenant's action", async ({ browser }) => {
    const both = await browser.newContext({ baseURL: ORIGIN });
    const main = await browser.newContext({ baseURL: ORIGIN });
    await signIn(both.request, "reviewer");
    await signIn(main.request, "main-reviewer");
    await mockControl(both.request, "reset");

    const all = await actionIds(both.request);
    const visibleToMain = new Set(await actionIds(main.request));
    const crossTenant = all.find((id) => !visibleToMain.has(id));
    expect(crossTenant).toBeDefined();

    expect((await main.request.get(`/api/actions/${crossTenant}`)).status()).toBe(404);
    const decision = await main.request.post(`/api/actions/${crossTenant}/approve`, {
      headers: { origin: ORIGIN, "idempotency-key": "e2e-key-0123456789abcdef" },
      data: { decision: "approve", recordVersion: 1 },
    });
    expect(decision.status()).toBe(404);
    await both.close();
    await main.close();
  });

  test("SECURITY-001: a cross-site origin and a forged actorId are rejected", async ({ page }) => {
    await signIn(page.context().request, "reviewer");
    await mockControl(page.context().request, "reset");
    const headers = { "idempotency-key": "e2e-key-0123456789abcdef" };
    const evil = await page.context().request.post("/api/actions/act_0001/approve", {
      headers: { ...headers, origin: "https://evil.example" },
      data: { decision: "approve", recordVersion: 1 },
    });
    expect(evil.status()).toBe(403);
    const forged = await page.context().request.post("/api/actions/act_0001/approve", {
      headers: { ...headers, origin: ORIGIN },
      data: { decision: "approve", recordVersion: 1, actorId: "evil" },
    });
    expect(forged.status()).toBe(400);
  });
});
