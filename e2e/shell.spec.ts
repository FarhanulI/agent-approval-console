import { expect, test } from "@playwright/test";

test.describe("desktop shell", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("shows sidebar navigation with the active route", async ({ page }) => {
    await page.goto("/approvals");

    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "Approvals" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("link", { name: "Live runs" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Audit log" })).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pending Actions");
    await expect(
      page.getByRole("button", { name: "Open navigation menu" }),
    ).toBeHidden();
  });

  test("keeps Approvals active on a nested route", async ({ page }) => {
    await page.goto("/approvals/example-id");

    await expect(
      page
        .getByRole("navigation", { name: "Primary" })
        .getByRole("link", { name: "Approvals" }),
    ).toHaveAttribute("aria-current", "location");
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeVisible();
  });

  test("navigates between sections", async ({ page }) => {
    await page.goto("/approvals");
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Audit log" })
      .click();

    await expect(page).toHaveURL(/\/audit$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Audit log");
  });
});

test.describe("mobile shell", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("opens, navigates and dismisses the navigation drawer", async ({ page }) => {
    await page.goto("/approvals");

    const trigger = page.getByRole("button", { name: "Open navigation menu" });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    const drawer = page.getByRole("dialog", { name: "Navigation menu" });
    await expect(drawer).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await drawer.getByRole("link", { name: "Live runs" }).click();
    await expect(page).toHaveURL(/\/runs$/);
    await expect(drawer).toBeHidden();
  });

  test("does not scroll horizontally", async ({ page }) => {
    await page.goto("/approvals");

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
  });
});
