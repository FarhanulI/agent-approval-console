// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { approvalKeys } from "@/features/approvals/hooks/use-actions-query";
import { createHttpActionsService } from "@/features/approvals/services/actions-service";
import { commitMockDecision, getMockDecisionLog, resetMockActionState } from "@/mocks/action-store";
import { handlers } from "@/mocks/handlers";
import {
  resetDecisionScenario,
  resetDetailScenario,
  setDecisionScenario,
  setDetailScenario,
} from "@/mocks/handlers/action-details";
import { ActionDetail } from "./action-detail";

const server = setupServer(...handlers);
const service = createHttpActionsService({ baseUrl: "http://api.test", decisionsEnabled: true });
const readOnlyService = createHttpActionsService({
  baseUrl: "http://api.test",
  decisionsEnabled: false,
});

// jsdom does not implement modal <dialog>; emulate open/close so the shared
// Dialog component behaves as in a browser.
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
beforeEach(() => {
  delete (window as unknown as { __pwned?: number }).__pwned;
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  resetDetailScenario();
  resetDecisionScenario();
  resetMockActionState();
});
afterAll(() => server.close());

/** No jest-dom in this repo: assert on `textContent` directly. */
function expectText(element: HTMLElement | Node | null, expected: string | RegExp) {
  const content = element?.textContent ?? "";
  if (typeof expected === "string") expect(content).toContain(expected);
  else expect(content).toMatch(expected);
}

function renderDetail(actionId: string, svc = service, gcTime = 0) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime } } });
  render(
    <QueryClientProvider client={client}>
      <ActionDetail actionId={actionId} service={svc} />
    </QueryClientProvider>,
  );
  return client;
}

const loaded = (title: string) => screen.findByRole("heading", { name: title, level: 2 });
const approveButton = () => screen.getByRole("button", { name: "Approve" });

async function openApproveDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(approveButton());
  return screen.getByRole("dialog");
}

// Covers ACTION-DETAIL-002..006.
describe("ActionDetail: read-only rendering", () => {
  it("shows a loading state, then summary, agent summary, evidence and diff", async () => {
    setDetailScenario({ kind: "ok", delayMs: 50 });
    renderDetail("act_0001");
    expectText(screen.getByRole("status"), "Loading action");

    await loaded("Update credit limit");
    expect(screen.getByText("act_0001")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByText("Finance Agent")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Agent summary" })).toBeTruthy();
    expect(screen.getByText(/not a transcript of the agent/)).toBeTruthy();
    expect(screen.getByText("Payment history, last 12 months")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to Pending Actions Queue/ })).toHaveProperty(
      "pathname",
      "/approvals",
    );
  });

  it("renders every diff kind and keeps null distinct from not-provided", async () => {
    renderDetail("act_0001");
    await loaded("Update credit limit");
    const table = screen.getByRole("table");
    for (const label of [
      "Changed",
      "Added",
      "Removed",
      "Unchanged",
      "Existing value not provided",
      "Proposed value not provided",
      "Cannot be compared",
    ]) {
      expect(within(table).getAllByText(label).length).toBeGreaterThan(0);
    }
    const tones = [...table.querySelectorAll("[data-value-tone]")].map((el) =>
      el.getAttribute("data-value-tone"),
    );
    expect(tones).toContain("null");
    expect(tones).toContain("absent");
  });

  it("renders hostile evidence and values as inert text", async () => {
    renderDetail("act_0002");
    await loaded("Merge duplicate supplier records");

    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("main b, b")).toBeNull();
    expect(screen.getByText(/<script>window.__pwned=1<\/script><img src=x/)).toBeTruthy();
    expect(screen.getByText("javascript:alert(1)")).toBeTruthy();
    expect(screen.getByText("(empty string)")).toBeTruthy();
    expect(
      screen.queryAllByRole("link").some((link) => link.getAttribute("href")?.startsWith("javascript:")),
    ).toBe(false);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("shows explicit empty states for missing evidence and changes", async () => {
    renderDetail("act_0003");
    await loaded("Adjust stock quantity");
    expect(screen.getByText("No source evidence was supplied for this action.")).toBeTruthy();
    expect(screen.getByText("No record changes were supplied for this action.")).toBeTruthy();
  });

  it("shows not-found with a way back", async () => {
    renderDetail("act_9999");
    expectText(await screen.findByRole("alert"), "Action not found");
    expect(screen.getByRole("link", { name: /Back to Pending Actions Queue/ })).toBeTruthy();
  });

  it("shows an error with retry for server errors and malformed payloads, and recovers", async () => {
    const user = userEvent.setup();
    setDetailScenario({ kind: "server-error", requestId: "req_42" });
    renderDetail("act_0001");
    expectText(await screen.findByRole("alert"), "Could not load the action");
    expect(screen.getByText("req_42")).toBeTruthy();

    setDetailScenario({ kind: "ok" });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await loaded("Update credit limit");
  });

  it("treats a malformed payload as an error, not as data", async () => {
    setDetailScenario({ kind: "malformed" });
    renderDetail("act_0001");
    expectText(await screen.findByRole("alert"), "unexpected format");
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("marks data as stale when a refresh fails and blocks decisions until it recovers", async () => {
    const user = userEvent.setup();
    const client = renderDetail("act_0001");
    await loaded("Update credit limit");
    await waitFor(() => expect(approveButton()).toHaveProperty("disabled", false));

    setDetailScenario({ kind: "server-error" });
    await client.invalidateQueries({ queryKey: approvalKeys.detail("act_0001") });
    expect((await screen.findAllByText(/may be out of date/)).length).toBeGreaterThan(0);
    expect(approveButton()).toHaveProperty("disabled", true);

    setDetailScenario({ kind: "ok" });
    await user.click(screen.getAllByRole("button", { name: "Try again" })[0]);
    await waitFor(() => expect(approveButton()).toHaveProperty("disabled", false));
  });
});

// Covers DECISION-001.
describe("ActionDetail: decision eligibility", () => {
  it("offers Approve/Reject for a pending action", async () => {
    renderDetail("act_0001");
    await loaded("Update credit limit");
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
  });

  it("hides decisions for a non-pending action and explains why", async () => {
    renderDetail("act_0004"); // approved fixture
    await screen.findByTestId("decision-unavailable");
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expectText(screen.getByTestId("decision-unavailable"), /approved/i);
    expect(screen.getAllByText(/Approval is not execution/).length).toBeGreaterThan(0);
  });

  it("is read-only when decisions are unavailable in the environment", async () => {
    renderDetail("act_0001", readOnlyService);
    await loaded("Update credit limit");
    expectText(screen.getByTestId("decision-unavailable"), /unavailable/i);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });
});

// Covers DECISION-002..008.
describe("ActionDetail: decision workflow", () => {
  it("opens a keyboard-operable confirmation and cancelling sends nothing", async () => {
    const user = userEvent.setup();
    renderDetail("act_0001");
    await loaded("Update credit limit");
    await waitFor(() => expect(approveButton()).toHaveProperty("disabled", false));

    approveButton().focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Approve this action?")).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getMockDecisionLog()).toHaveLength(0);
  });

  it("submits exactly the displayed version and reason, and reports approved (not executed)", async () => {
    const user = userEvent.setup();
    renderDetail("act_0005"); // fixture record version 5
    await loaded("Change payment terms");
    await waitFor(() => expect(approveButton()).toHaveProperty("disabled", false));
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText(/Reason/), "Looks right");
    const dialog = await openApproveDialog(user);
    expectText(within(dialog).getByText("Record version submitted").nextSibling, "5");
    await user.click(within(dialog).getByRole("button", { name: "Confirm approval" }));

    expect(await screen.findByText("Approval recorded")).toBeTruthy();
    expect(screen.getAllByText(/Approval is not execution/).length).toBeGreaterThan(0);
    expect(getMockDecisionLog()).toEqual([
      expect.objectContaining({
        decision: "approve",
        recordVersion: 5,
        reason: "Looks right",
      }),
    ]);

    // Authoritative refetch shows Approved, never Executed, and removes the controls.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Approve" })).toBeNull());
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
    expect(screen.queryByText("Executed")).toBeNull();
  });

  it("reports a rejection", async () => {
    const user = userEvent.setup();
    renderDetail("act_0001");
    await loaded("Update credit limit");
    await waitFor(() => expect(approveButton()).toHaveProperty("disabled", false));
    await user.click(screen.getByRole("button", { name: "Reject" }));
    await user.click(screen.getByRole("button", { name: "Confirm rejection" }));
    expect(await screen.findByText("Rejection recorded")).toBeTruthy();
    expect(getMockDecisionLog()[0]).toMatchObject({ decision: "reject", recordVersion: 1 });
  });

  it("prevents duplicate submissions while a decision is in flight", async () => {
    const user = userEvent.setup();
    let posts = 0;
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST") posts += 1;
    });
    setDecisionScenario({ kind: "ok", delayMs: 150 });
    renderDetail("act_0001");
    await loaded("Update credit limit");
    await waitFor(() => expect(approveButton()).toHaveProperty("disabled", false));

    const dialog = await openApproveDialog(user);
    const confirm = within(dialog).getByRole("button", { name: "Confirm approval" });
    await user.dblClick(confirm);
    expect(confirm).toHaveProperty("disabled", true);
    expect(approveButton()).toHaveProperty("disabled", true);

    await screen.findByText("Approval recorded");
    expect(posts).toBe(1);
    expect(getMockDecisionLog()).toHaveLength(1);
  });

  it("shows a conflict, refreshes, preserves the reason and never shows success", async () => {
    const user = userEvent.setup();
    setDecisionScenario({ kind: "conflict" });
    renderDetail("act_0001");
    await loaded("Update credit limit");
    await waitFor(() => expect(approveButton()).toHaveProperty("disabled", false));

    await user.type(screen.getByLabelText(/Reason/), "Please approve");
    const dialog = await openApproveDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Confirm approval" }));

    expectText(await screen.findByRole("alert"), /changed after you loaded it/);
    expect(screen.queryByText("Approval recorded")).toBeNull();
    expect(screen.getByLabelText(/Reason/)).toHaveProperty("value", "Please approve");
    expect(screen.queryByRole("dialog")).toBeNull();
    // Recovery: controls come back once the refreshed data is in.
    await waitFor(() => expect(approveButton()).toHaveProperty("disabled", false));
  });

  it("reports an invalid transition when another reviewer decided first", async () => {
    const user = userEvent.setup();
    renderDetail("act_0001");
    await loaded("Update credit limit");
    await waitFor(() => expect(approveButton()).toHaveProperty("disabled", false));

    commitMockDecision("act_0001", { decision: "reject", recordVersion: 1 }); // someone else
    const dialog = await openApproveDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Confirm approval" }));

    expectText(await screen.findByRole("alert"), /no longer in a state/);
    expect(screen.queryByText("Approval recorded")).toBeNull();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Approve" })).toBeNull());
    expect(getMockDecisionLog()).toHaveLength(1); // only the other reviewer's
  });

  it("explains an authorization failure", async () => {
    const user = userEvent.setup();
    setDecisionScenario({ kind: "forbidden" });
    renderDetail("act_0001");
    await loaded("Update credit limit");
    await waitFor(() => expect(approveButton()).toHaveProperty("disabled", false));
    const dialog = await openApproveDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Confirm approval" }));
    expectText(await screen.findByRole("alert"), /not authorized/);
  });

  it("reconciles an unknown outcome that WAS committed, without resubmitting", async () => {
    const user = userEvent.setup();
    let posts = 0;
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST") posts += 1;
    });
    setDecisionScenario({ kind: "lost-response" });
    renderDetail("act_0001");
    await loaded("Update credit limit");
    await waitFor(() => expect(approveButton()).toHaveProperty("disabled", false));
    const dialog = await openApproveDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Confirm approval" }));

    expect(await screen.findByText(/could not be confirmed/)).toBeTruthy();
    expect(screen.queryByText("Approval recorded")).toBeNull();
    // The authoritative re-read reveals the committed state.
    expectText(await screen.findByText(/server now reports status/), /Approved/);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(posts).toBe(1);
  });

  it("keeps resubmission disabled when an unknown outcome stays ambiguous", async () => {
    const user = userEvent.setup();
    let posts = 0;
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST") posts += 1;
    });
    setDecisionScenario({ kind: "network-error" }); // nothing committed, but the client cannot know
    renderDetail("act_0001");
    await loaded("Update credit limit");
    await waitFor(() => expect(approveButton()).toHaveProperty("disabled", false));
    const dialog = await openApproveDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Confirm approval" }));

    expect(await screen.findByText(/Resubmission is disabled/)).toBeTruthy();
    expect(approveButton()).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Reject" })).toHaveProperty("disabled", true);
    expect(posts).toBe(1);
  });

  it("invalidates detail and list caches after a confirmed decision", async () => {
    const user = userEvent.setup();
    const client = renderDetail("act_0001", service, Infinity);
    client.setQueryData(approvalKeys.list({ page: 1 }), { items: [], pagination: { page: 1, pageSize: 10, total: 0 } });
    await loaded("Update credit limit");
    await waitFor(() => expect(approveButton()).toHaveProperty("disabled", false));
    expect(client.getQueryState(approvalKeys.list({ page: 1 }))?.isInvalidated).toBe(false);

    const dialog = await openApproveDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Confirm approval" }));
    await screen.findByText("Approval recorded");
    expect(client.getQueryState(approvalKeys.list({ page: 1 }))?.isInvalidated).toBe(true);
  });
});
