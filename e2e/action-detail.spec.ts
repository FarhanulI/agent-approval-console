import { expect, mockControl, test, type Page } from "./fixtures";

// Fixtures (server-side mock backend, deterministic): act_0001 is pending at
// record version 1 with rich evidence/diff; act_0004 is approved. The mock
// state lives in the server and is reset before every test by `./fixtures`.

type Scenario = { kind: string; delayMs?: number };
const setDecisionScenario = (page: Page, scenario: Scenario) =>
  mockControl(page.context().request, "decision", scenario);

test.use({ viewport: { width: 1280, height: 800 } });

async function openFromQueue(page: Page, actionId: string) {
  await page.goto(`/approvals?q=${actionId}`);
  await page.getByRole("table").getByRole("link", { name: new RegExp(`.+`) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/approvals/${actionId}$`));
}

test.describe("action detail", () => {
  test("opens from the queue and shows summary, evidence, diff and decision controls", async ({
    page,
  }) => {
    await openFromQueue(page, "act_0001");

    await expect(page.getByRole("heading", { name: "Update credit limit" })).toBeVisible();
    await expect(page.getByText("act_0001", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Agent summary" })).toBeVisible();
    await expect(page.getByText("Payment history, last 12 months")).toBeVisible();

    const diff = page.getByRole("table");
    await expect(diff.getByText("Added")).toBeVisible();
    await expect(diff.getByText("Removed")).toBeVisible();
    await expect(diff.getByText("Existing value not provided")).toBeVisible();
    await expect(diff.getByText("Cannot be compared")).toBeVisible();

    await expect(page.getByRole("button", { name: "Approve" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  test("approves with confirmation, shows approved (not executed) and reconciles the queue", async ({
    page,
  }) => {
    await openFromQueue(page, "act_0001");
    await page.getByLabel(/Reason/).fill("Verified payment history");
    await expect(page.getByRole("button", { name: "Approve" })).toBeEnabled();
    await page.getByRole("button", { name: "Approve" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Record version submitted");
    await dialog.getByRole("button", { name: "Confirm approval" }).click();

    await expect(page.getByText("Approval recorded")).toBeVisible();
    await expect(page.getByText(/Approval is not execution/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
    // Scoped to the summary card: Next keeps the previous (queue) route hidden in
    // the DOM, and its status filter legitimately contains an "Executed" option.
    const summary = page.getByRole("region", { name: "Update credit limit" });
    await expect(summary).toContainText("Approved");
    await expect(summary.getByText("Executed", { exact: true })).toHaveCount(0);

    // Back to the queue: the row now reflects the new status.
    await page.goBack();
    await expect(page.getByRole("table").locator("tbody tr").first()).toContainText("Approved");
  });

  test("recovers from a conflict without showing success", async ({ page }) => {
    await openFromQueue(page, "act_0001");
    await expect(page.getByRole("button", { name: "Approve" })).toBeEnabled();
    await setDecisionScenario(page, { kind: "conflict" });

    await page.getByLabel(/Reason/).fill("keep me");
    await page.getByRole("button", { name: "Approve" }).click();
    await page.getByRole("button", { name: "Confirm approval" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "changed after you loaded it" })).toBeVisible();
    await expect(page.getByText("Approval recorded")).toHaveCount(0);
    await expect(page.getByLabel(/Reason/)).toHaveValue("keep me");

    await setDecisionScenario(page, { kind: "ok" });
    await expect(page.getByRole("button", { name: "Approve" })).toBeEnabled();
    await page.getByRole("button", { name: "Approve" }).click();
    await page.getByRole("button", { name: "Confirm approval" }).click();
    await expect(page.getByText("Approval recorded")).toBeVisible();
  });

  test("blocks resubmission when the outcome cannot be confirmed", async ({ page }) => {
    await openFromQueue(page, "act_0001");
    await expect(page.getByRole("button", { name: "Approve" })).toBeEnabled();
    await setDecisionScenario(page, { kind: "network-error" });

    await page.getByRole("button", { name: "Approve" }).click();
    await page.getByRole("button", { name: "Confirm approval" }).click();

    await expect(page.getByText(/Resubmission is disabled/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
    await expect(page.getByText("Approval recorded")).toHaveCount(0);
  });

  test("offers no decision controls for a non-pending action", async ({ page }) => {
    await page.goto("/approvals/act_0004");
    await expect(page.getByTestId("decision-unavailable")).toContainText(/approved/i);
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reject" })).toHaveCount(0);
  });

  test("shows not-found for an unknown action", async ({ page }) => {
    await page.goto("/approvals/act_9999");
    await expect(page.getByRole("alert").filter({ hasText: "Action not found" })).toBeVisible();
    await page.getByRole("link", { name: /Back to Pending Actions Queue/ }).click();
    await expect(page).toHaveURL(/\/approvals$/);
  });
});
