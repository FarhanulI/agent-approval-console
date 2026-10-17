import { expect, test, type Page } from "@playwright/test";

// Fixtures: 47 deterministic actions, 10 per page, newest first by default.
// The newest action is act_0047; the oldest is act_0001.

type MockControls = {
  setActionsScenario(scenario: { kind: string; delayMs?: number }): void;
  resetActionsScenario(): void;
};

async function setScenario(page: Page, scenario: { kind: string; delayMs?: number }) {
  await page.evaluate(
    (value) =>
      (window as unknown as { __mock: MockControls }).__mock.setActionsScenario(value),
    scenario,
  );
}

async function resetScenario(page: Page) {
  await page.evaluate(() =>
    (window as unknown as { __mock: MockControls }).__mock.resetActionsScenario(),
  );
}

const dataRows = (page: Page) => page.getByRole("table").locator("tbody tr");

// Retries until the filtered response has replaced the previous rows, so it
// cannot pass against stale data.
async function expectEveryRowToContain(page: Page, text: string) {
  await expect(dataRows(page)).not.toHaveCount(0);
  await expect(dataRows(page).filter({ hasNotText: text })).toHaveCount(0);
}

const firstDetailHref = (page: Page) =>
  page.getByRole("table").getByRole("link").first().getAttribute("href");

test.describe("pending actions queue (desktop)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("opens the page and shows MSW-backed actions", async ({ page }) => {
    await page.goto("/approvals");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pending Actions");
    await expect(dataRows(page)).toHaveCount(10);
    await expect(page.getByText("Page 1 of 5 · 47 actions")).toBeVisible();
    expect(await firstDetailHref(page)).toBe("/approvals/act_0047");
  });

  test("searches and filters, reflected in the URL, then clears", async ({ page }) => {
    await page.goto("/approvals");
    await expect(dataRows(page)).toHaveCount(10);

    await page.getByLabel("Search actions").fill("inventory agent");
    await expect(page).toHaveURL(/q=inventory\+agent/);
    await expect(page.getByRole("list", { name: "Active filters" })).toContainText(
      "Search: “inventory agent”",
    );
    await expectEveryRowToContain(page, "Inventory Agent");

    await page.getByLabel("Status").selectOption("pending");
    await expect(page).toHaveURL(/status=pending/);
    await expectEveryRowToContain(page, "Pending");

    await page.getByLabel("Risk").selectOption("high");
    await expect(page).toHaveURL(/risk=high/);

    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await expect(page).toHaveURL(/\/approvals$/);
    await expect(page.getByLabel("Search actions")).toHaveValue("");
    await expect(dataRows(page)).toHaveCount(10);
  });

  test("restores state from a deep link", async ({ page }) => {
    await page.goto("/approvals?status=pending&sort=-risk&page=2");

    await expect(page.getByLabel("Status")).toHaveValue("pending");
    await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: /risk/i }),
    ).toHaveAttribute("aria-sort", "descending");
  });

  test("changes the sort order on the server", async ({ page }) => {
    await page.goto("/approvals");
    await expect(dataRows(page)).toHaveCount(10);
    await expect(
      page.getByRole("columnheader", { name: /created/i }),
    ).toHaveAttribute("aria-sort", "descending");

    await page.getByRole("button", { name: /created/i }).click();
    await expect(page).toHaveURL(/sort=createdAt/);
    await expect(
      page.getByRole("columnheader", { name: /created/i }),
    ).toHaveAttribute("aria-sort", "ascending");
    await expect.poll(() => firstDetailHref(page)).toBe("/approvals/act_0001");

    await page.getByRole("button", { name: /risk/i }).click();
    await expect(
      page.getByRole("columnheader", { name: /risk/i }),
    ).not.toHaveAttribute("aria-sort", "none");
  });

  test("navigates between pages", async ({ page }) => {
    await page.goto("/approvals");
    await expect(dataRows(page)).toHaveCount(10);
    await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText("Page 2 of 5 · 47 actions")).toBeVisible();
    expect(await firstDetailHref(page)).toBe("/approvals/act_0037");

    await page.goto("/approvals?page=5");
    await expect(dataRows(page)).toHaveCount(7);
    await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();

    await page.getByRole("button", { name: "Previous page" }).click();
    await expect(page.getByText("Page 4 of 5 · 47 actions")).toBeVisible();
  });

  test("opens an action detail route", async ({ page }) => {
    await page.goto("/approvals");
    await expect(dataRows(page)).toHaveCount(10);

    await page.getByRole("table").getByRole("link").first().click();
    await expect(page).toHaveURL(/\/approvals\/act_0047$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Action details");
    await expect(page.getByText("act_0047")).toBeVisible();
  });

  test("handles an empty result and recovers", async ({ page }) => {
    await page.goto("/approvals?q=zzz-no-match");

    await expect(page.getByText("No actions match the current criteria")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);

    await page
      .getByRole("main")
      .getByRole("button", { name: "Clear filters" })
      .last()
      .click();
    await expect(dataRows(page)).toHaveCount(10);
  });

  test("shows a server error and recovers on retry", async ({ page }) => {
    await page.goto("/approvals");
    await expect(dataRows(page)).toHaveCount(10);

    await setScenario(page, { kind: "server-error" });
    await page.getByRole("button", { name: "Next page" }).click();

    const alert = page.getByRole("main").getByRole("alert");
    await expect(alert).toContainText("Pending actions could not be loaded");
    await expect(alert).toContainText("req_mock_500");

    await resetScenario(page);
    await alert.getByRole("button", { name: "Retry" }).click();
    await expect(dataRows(page)).toHaveCount(10);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });

  test("selects and clears rows; bulk decisions stay disabled", async ({ page }) => {
    await page.goto("/approvals");
    await expect(dataRows(page)).toHaveCount(10);

    const boxes = page.getByRole("checkbox", { name: /^Select action:/ });
    await boxes.first().check();
    await expect(page.getByText("1 action selected on this page")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve selected" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Reject selected" })).toBeDisabled();

    await page
      .getByRole("checkbox", { name: "Select all pending actions on this page" })
      .check();
    const selectable = await boxes.count();
    await expect(
      page.getByText(`${selectable} actions selected on this page`),
    ).toBeVisible();

    // Non-pending actions cannot be selected.
    await expect(
      page.getByRole("checkbox", { name: /^Action not selectable/ }).first(),
    ).toBeDisabled();

    await page.getByRole("button", { name: "Clear selection" }).click();
    await expect(page.getByText(/selected on this page/)).toHaveCount(0);
    await expect(boxes.first()).not.toBeChecked();
  });

  test("drops the selection when the page changes", async ({ page }) => {
    await page.goto("/approvals");
    await expect(dataRows(page)).toHaveCount(10);
    await page.getByRole("checkbox", { name: /^Select action:/ }).first().check();
    await expect(page.getByText(/selected on this page/)).toBeVisible();

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText("Page 2 of 5 · 47 actions")).toBeVisible();
    await expect(page.getByText(/selected on this page/)).toHaveCount(0);
  });

  test("marks stale rows and blocks actions while the next page loads", async ({ page }) => {
    await page.goto("/approvals");
    await expect(dataRows(page)).toHaveCount(10);

    await setScenario(page, { kind: "ok", delayMs: 800 });
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText("Updating results…")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
    await expect(page.getByText("Page 2 of 5 · 47 actions")).toBeVisible();
    await expect(page.getByText("Updating results…")).toBeHidden();
  });

  test("keeps the page free of horizontal overflow", async ({ page }) => {
    await page.goto("/approvals");
    await expect(dataRows(page)).toHaveCount(10);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });
});

test.describe("pending actions queue (mobile)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("scrolls the table inside its own region, not the page", async ({ page }) => {
    await page.goto("/approvals");
    await expect(dataRows(page)).toHaveCount(10);

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);

    const region = page.getByRole("region", { name: "Pending actions table" });
    const scrollable = await region.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrollable).toBe(true);

    // Filters and pagination remain reachable without horizontal scrolling.
    await expect(page.getByLabel("Search actions")).toBeVisible();
    await expect(page.getByLabel("Status")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
  });

  test("filters work on a narrow viewport", async ({ page }) => {
    await page.goto("/approvals");
    await expect(dataRows(page)).toHaveCount(10);
    await page.getByLabel("Risk").selectOption("critical");
    await expect(page).toHaveURL(/risk=critical/);
    await expectEveryRowToContain(page, "Critical");
  });
});
