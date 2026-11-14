import { expect, mockControl, test } from "./fixtures";

test.describe("live run timeline", () => {
  test("lists runs and supports search with a no-match state", async ({ page }) => {
    await page.goto("/runs");
    await expect(page.getByRole("heading", { name: "Live runs" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Finance Agent/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Master Data Agent/ })).toHaveCount(2);
    await expect(page.getByRole("link", { name: /Completed/ })).toBeVisible();

    await page.getByLabel("Search runs").fill("no-such-run");
    await expect(page.getByText("No runs match your search")).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByRole("link", { name: /Finance Agent/ })).toBeVisible();
  });

  test("shows the running timeline and receives ordered mock events", async ({ page }) => {
    await page.goto("/runs/run_0101");
    await expect(page.getByRole("heading", { name: "Execution timeline" })).toBeVisible();
    await expect(page.getByText("Live updates connected.")).toBeVisible();
    await expect(page.getByText("Sequence 4")).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Run events" }).getByText("Compare tax registration"),
    ).toBeVisible();
    await expect(page.getByText("Running", { exact: true }).first()).toBeVisible();
  });

  test("links waiting runs to the existing action workflow and reconciles after approval", async ({
    page,
  }) => {
    await page.goto("/runs/run_0100");
    await expect(page.getByText("Human approval required")).toBeVisible();
    await page.getByRole("link", { name: "Review action act_0002" }).click();
    await expect(page).toHaveURL(/\/approvals\/act_0002$/);

    await page.getByRole("button", { name: "Approve" }).click();
    await page.getByRole("button", { name: "Confirm approval" }).click();
    await expect(page.getByText("Approval recorded")).toBeVisible();
    await page.goBack();

    await expect(page.getByText("Approval resolved")).toBeVisible();
    await expect(page.getByText("Approval recorded. Business execution has not been confirmed.")).toBeVisible();
    await expect(page.getByText("Running", { exact: true }).first()).toBeVisible();
  });

  test("shows completed, failed, and cancelled run outcomes", async ({ page }) => {
    for (const [runId, status, result] of [
      ["run_0102", "Completed", "Inventory count passed validation."],
      ["run_0103", "Failed", "The mock destination rejected the profile."],
      ["run_0104", "Cancelled", "Run cancelled by the mock scenario."],
    ]) {
      await page.goto(`/runs/${runId}`);
      await expect(page.getByText(status, { exact: true })).toBeVisible();
      await expect(page.getByText(new RegExp(result))).toBeVisible();
      await expect(page.getByText(/not active.*snapshot/i)).toBeVisible();
    }
  });

  test("handles empty, failed, and reconnecting mock streams", async ({ page }) => {
    const request = page.context().request;
    await mockControl(request, "runs", { kind: "empty" });
    await page.goto("/runs");
    await expect(page.getByText("No agent runs yet")).toBeVisible();

    await mockControl(request, "runs", { kind: "server-error" });
    await page.reload();
    await expect(page.getByText("Agent runs could not be loaded")).toBeVisible();

    await mockControl(request, "runs", { kind: "disconnect-once" });
    await page.goto("/runs/run_0101");
    await expect(page.getByText("Live updates connected.")).toBeVisible();
    await expect(page.getByText("Sequence 4")).toBeVisible();
  });

  test("recovers from an expired replay cursor without duplicating timeline entries", async ({
    page,
  }) => {
    await mockControl(page.context().request, "runs", { kind: "expired-cursor" });
    await page.goto("/runs/run_0101");

    await expect(page.getByText("Live updates connected.")).toBeVisible();
    const events = page.getByRole("list", { name: "Run events" });
    await expect(events.locator("li")).toHaveCount(4);
    await expect(events.getByText("Sequence 4")).toBeVisible();
  });

  test("shows incomplete recovery after snapshot failure and retries successfully", async ({
    page,
  }) => {
    await mockControl(page.context().request, "runs", {
      kind: "snapshot-failure-on-recovery",
    });
    await page.goto("/runs/run_0101");

    await expect(
      page.getByText(/Run recovery is incomplete\. Some event history may be missing/),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry recovery" })).toBeVisible();

    await mockControl(page.context().request, "runs", { kind: "ok" });
    await page.getByRole("button", { name: "Retry recovery" }).click();
    await expect(page.getByText("Live updates connected.")).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Run events" }).locator("li"),
    ).toHaveCount(4);
  });

  test("marks unavailable history explicitly while retaining the run snapshot", async ({
    page,
  }) => {
    await mockControl(page.context().request, "runs", { kind: "history-unavailable" });
    await page.goto("/runs/run_0101");

    await expect(page.getByText(/Event history is unavailable/)).toBeVisible();
    await expect(page.getByText("Sequence 4")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry recovery" })).toBeVisible();
  });

  test("reconciles a run that completes while the stream is interrupted", async ({ page }) => {
    await mockControl(page.context().request, "runs", {
      kind: "run-completes-during-disconnect",
    });
    await page.goto("/runs/run_0101");

    await expect(page.getByText("Completed", { exact: true })).toBeVisible();
    await expect(
      page.getByText("The mock run completed while its event stream was disconnected."),
    ).toBeVisible();
    await expect(page.getByText(/not active.*snapshot/i)).toBeVisible();
    await expect(page.getByText("Sequence 5")).toBeVisible();
  });
});
