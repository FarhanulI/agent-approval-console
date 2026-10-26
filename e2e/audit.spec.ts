import { expect as baseExpect, test as bareTest } from "@playwright/test";
import { expect, mockControl, signIn, test } from "./fixtures";

const ORIGIN = "http://localhost:3100";
const rows = (page: import("@playwright/test").Page) => page.getByRole("table").locator("tbody tr");

test.describe("audit log", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("lists events newest first with pagination", async ({ page }) => {
    await page.goto("/audit");
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect(rows(page)).toHaveCount(10);
    await expect(page.getByText(/Page 1 of \d+ · \d+ events/)).toBeVisible();

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText(/^Page 2 of/)).toBeVisible();
  });

  test("filters by outcome, reflects it in the URL, and clears filters", async ({ page }) => {
    await page.goto("/audit");
    await expect(rows(page)).toHaveCount(10);
    await page.getByLabel("Outcome").selectOption("unknown");
    await expect(page).toHaveURL(/outcome=unknown/);
    await expect(rows(page).first()).toBeVisible();
    await expect(rows(page).filter({ hasNotText: "Unknown" })).toHaveCount(0);

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/audit$/);
    await expect(rows(page)).toHaveCount(10);
  });

  test("shows a no-results state for a search with no match", async ({ page }) => {
    await page.goto("/audit?q=zzz-no-match");
    await expect(page.getByText("No events match the current criteria")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await expect(rows(page)).toHaveCount(10);
  });

  test("filters by UTC date range", async ({ page }) => {
    await page.goto("/audit?from=2026-10-01&to=2026-10-01");
    await expect(rows(page).first()).toBeVisible();
    await expect(page.getByText(/Oct 1, 2026/).first()).toBeVisible();
    await expect(rows(page).filter({ hasNotText: "Oct 1, 2026" })).toHaveCount(0);
  });

  test("shows an error with retry, then recovers", async ({ page }) => {
    await mockControl(page.context().request, "audit", { kind: "server-error" });
    await page.goto("/audit");
    await expect(page.getByText("Audit events could not be loaded")).toBeVisible();
    await expect(page.getByText(/req_[0-9a-f-]{36}/)).toBeVisible();

    await mockControl(page.context().request, "audit", { kind: "ok" });
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(rows(page)).toHaveCount(10);
  });

  test("shows the empty state when there is no history", async ({ page }) => {
    await mockControl(page.context().request, "audit", { kind: "empty" });
    await page.goto("/audit");
    await expect(page.getByText("No audit events yet")).toBeVisible();
  });

  test("opens the event detail dialog", async ({ page }) => {
    await page.goto("/audit");
    await page.getByRole("button", { name: /^View details for event/ }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Request ID")).toBeVisible();
    await expect(dialog.getByText("Event ID")).toBeVisible();
    await dialog.getByRole("button", { name: "Close dialog" }).click();
    await expect(dialog).toBeHidden();
  });

  test("a decision appears in the audit log without being labelled as executed", async ({ page }) => {
    const request = page.context().request;
    const before = (await (await request.get("/api/audit-events?actionId=act_0001")).json()).pagination.total;
    const response = await request.post("/api/actions/act_0001/approve", {
      headers: { origin: ORIGIN, "idempotency-key": "e2e-audit-key-0123456789" },
      data: { decision: "approve", recordVersion: 1 },
    });
    expect(response.status()).toBe(200);
    const after = await (await request.get("/api/audit-events?actionId=act_0001&pageSize=100")).json();
    expect(after.pagination.total).toBe(before + 1);
    expect(JSON.stringify(after)).not.toMatch(/executed/i);

    await page.goto("/audit?q=act_0001");
    await expect(page.getByText(/Execution has not been performed/).first()).toBeVisible();
  });

  test("TENANT-001: another tenant's events are not readable", async ({ browser }) => {
    const both = await browser.newContext({ baseURL: ORIGIN });
    const main = await browser.newContext({ baseURL: ORIGIN });
    await signIn(both.request, "reviewer");
    await signIn(main.request, "main-reviewer");
    await mockControl(both.request, "reset");

    const all = (await (await both.request.get("/api/audit-events?pageSize=100")).json()).items as { id: string }[];
    const visible = new Set(
      ((await (await main.request.get("/api/audit-events?pageSize=100")).json()).items as { id: string }[]).map((e) => e.id),
    );
    const hidden = all.find((e) => !visible.has(e.id));
    expect(hidden).toBeDefined();
    expect((await main.request.get(`/api/audit-events/${hidden!.id}`)).status()).toBe(404);
    expect((await main.request.get("/api/audit-events?tenantId=tenant_east")).status()).toBe(400);
    await both.close();
    await main.close();
  });
});

bareTest.describe("audit log authentication", () => {
  bareTest("redirects unauthenticated page requests and returns 401 for the API", async ({ page, request }) => {
    await page.goto("/audit");
    await baseExpect(page).toHaveURL(/\/login\?callbackUrl=%2Faudit$/);
    const response = await request.get("/api/audit-events");
    baseExpect(response.status()).toBe(401);
    baseExpect((await response.json()).error.code).toBe("unauthenticated");
  });
});
