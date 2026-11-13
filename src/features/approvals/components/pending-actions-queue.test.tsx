// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { handlers } from "@/mocks/handlers";
import { actionFixtures } from "@/mocks/fixtures/actions";
import {
  resetActionsScenario,
  setActionsScenario,
} from "@/mocks/handlers/actions";
import { createHttpActionsService } from "../services/actions-service";
import { ActionsServiceError } from "../services/actions-service-error";
import type { ActionsService } from "../types";
import { PendingActionsQueue } from "./pending-actions-queue";

// A tiny stand-in for the Next.js router: the URL lives in a store and
// `router.replace` updates it, re-rendering consumers of useSearchParams.
const urlStore = vi.hoisted(() => {
  let search = "";
  const listeners = new Set<() => void>();
  return {
    get: () => search,
    set(next: string) {
      search = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    usePathname: () => "/approvals",
    useRouter: () => ({
      replace: (url: string) => urlStore.set(url.split("?")[1] ?? ""),
    }),
    useSearchParams: () => {
      const search = React.useSyncExternalStore(urlStore.subscribe, urlStore.get, urlStore.get);
      return React.useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});

const server = setupServer(...handlers);
const service = createHttpActionsService({ baseUrl: "http://api.test" });
const dialogOpeners = new WeakMap<HTMLDialogElement, HTMLElement | null>();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      dialogOpeners.set(
        this,
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
      );
      this.setAttribute("open", "");
      this.querySelector("button")?.focus();
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
      dialogOpeners.get(this)?.focus();
    },
  });
});
beforeEach(() => urlStore.set(""));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetActionsScenario();
});
afterAll(() => server.close());

function renderQueue(
  queueService: ActionsService = service,
  strictMode = false,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0 } },
  });
  const queue = (
    <QueryClientProvider client={client}>
      <PendingActionsQueue service={queueService} />
    </QueryClientProvider>
  );
  const rendered = render(
    strictMode ? <StrictMode>{queue}</StrictMode> : queue,
  );
  return { ...rendered, queryClient: client };
}

function decisionService(
  bulkDecision: ActionsService["bulkDecision"],
): ActionsService {
  return { ...service, decisionsEnabled: true, bulkDecision };
}

const dataRows = () => screen.getAllByRole("row").slice(1);

describe("PendingActionsQueue", () => {
  it("shows a loading state first, then the first page of actions", async () => {
    renderQueue();
    expect(screen.getByText("Loading pending actions")).toBeTruthy();
    expect(screen.queryByText(/queue is empty/i)).toBeNull();

    await waitFor(() => expect(dataRows()).toHaveLength(10));
    expect(screen.getByText("Page 1 of 5 · 47 actions")).toBeTruthy();
  });

  it("moves focus with J/K and opens the focused action with Enter", async () => {
    renderQueue();
    await waitFor(() => expect(dataRows()).toHaveLength(10));

    const region = screen.getByRole("region", { name: "Pending actions table" });
    const links = within(screen.getByRole("table")).getAllByRole("link");
    const clickFirst = vi.spyOn(links[0], "click").mockImplementation(() => {});
    region.focus();

    fireEvent.keyDown(region, { key: "j" });
    expect(document.activeElement).toBe(links[0]);
    fireEvent.keyDown(links[0], { key: "j" });
    expect(document.activeElement).toBe(links[1]);
    fireEvent.keyDown(links[1], { key: "k" });
    expect(document.activeElement).toBe(links[0]);

    fireEvent.keyDown(links[0], { key: "Enter" });
    expect(clickFirst).toHaveBeenCalledOnce();
    expect(clickFirst.mock.calls).toHaveLength(1);
  });

  it("toggles the focused pending action with Space and selects eligible rows with Ctrl+A", async () => {
    renderQueue();
    await waitFor(() => expect(dataRows()).toHaveLength(10));

    const table = screen.getByRole("table");
    const region = screen.getByRole("region", { name: "Pending actions table" });
    const boxes = within(table).getAllByRole("checkbox", {
      name: /^Select action:/,
    }) as HTMLInputElement[];
    const firstEligibleIndex = boxes.findIndex((box) => !box.disabled);
    const link = within(boxes[firstEligibleIndex].closest("tr")!).getByRole("link");

    link.focus();
    expect(fireEvent.keyDown(link, { key: " " })).toBe(false);
    expect(boxes[firstEligibleIndex].checked).toBe(true);
    expect(screen.getByText("1 action selected on this page")).toBeTruthy();

    region.focus();
    fireEvent.keyDown(region, { key: "a", ctrlKey: true });
    expect(
      screen.getByText(`${boxes.length} actions selected on this page`),
    ).toBeTruthy();

    fireEvent.keyDown(region, { key: "Escape" });
    expect(screen.queryByText(/selected on this page/)).toBeNull();
  });

  it("clears selection after refreshed data and prevents old IDs from returning", async () => {
    const action = actionFixtures.find((item) => item.status === "pending")!;
    let status = action.status;
    const refreshService: ActionsService = {
      ...service,
      listActions: async (query) => ({
        items: [{ ...action, status }],
        pagination: {
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 10,
          total: 1,
        },
      }),
    };
    const { queryClient } = renderQueue(refreshService);
    await waitFor(() => expect(dataRows()).toHaveLength(1));

    await userEvent.click(
      screen.getByRole("checkbox", {
        name: `Select action: ${action.title} for ${action.targetRecord.label}`,
      }),
    );
    expect(screen.getByText("1 action selected on this page")).toBeTruthy();

    status = "approved";
    await queryClient.invalidateQueries();
    await waitFor(() => {
      const checkbox = screen.getByRole("checkbox", {
        name: new RegExp(`Action not selectable \\(approved\\)`),
      });
      expect((checkbox as HTMLInputElement).disabled).toBe(true);
    });
    expect(screen.queryByText(/selected on this page/)).toBeNull();

    status = "pending";
    await queryClient.invalidateQueries();
    await waitFor(() => expect(dataRows()).toHaveLength(1));
    expect(screen.queryByText(/selected on this page/)).toBeNull();
  });

  it("does not submit a confirmation after the queue data snapshot changes", async () => {
    const action = actionFixtures.find((item) => item.status === "pending")!;
    let recordVersion = action.recordVersion;
    const bulkDecision = vi.fn(async () => ({ results: [] }));
    const queueService: ActionsService = {
      ...decisionService(bulkDecision),
      listActions: async (query) => ({
        items: [{ ...action, recordVersion }],
        pagination: {
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 10,
          total: 1,
        },
      }),
    };
    const { queryClient } = renderQueue(queueService);
    await waitFor(() => expect(dataRows()).toHaveLength(1));
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: `Select action: ${action.title} for ${action.targetRecord.label}`,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Approve selected" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    recordVersion += 1;
    await queryClient.invalidateQueries();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bulkDecision).not.toHaveBeenCalled();
  });

  it("opens and closes shortcut help, including the question-mark shortcut", async () => {
    const user = userEvent.setup();
    renderQueue();
    await waitFor(() => expect(dataRows()).toHaveLength(10));

    const region = screen.getByRole("region", { name: "Pending actions table" });
    region.focus();
    fireEvent.keyDown(region, { key: "?" });

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Focus the next action on this page")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Close dialog" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: /Keyboard shortcuts/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("ignores queue shortcuts in search inputs and detaches its key listener on unmount", async () => {
    const addListener = vi.spyOn(document, "addEventListener");
    const removeListener = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderQueue(service, true);
    await waitFor(() => expect(dataRows()).toHaveLength(10));

    const search = screen.getByLabelText("Search actions");
    search.focus();
    fireEvent.keyDown(search, { key: "j" });
    fireEvent.keyDown(search, { key: "a", ctrlKey: true });
    expect(document.activeElement).toBe(search);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(/selected on this page/)).toBeNull();

    const registered = addListener.mock.calls
      .filter(([type]) => type === "keydown")
      .map(([, listener]) => listener);
    const activeBeforeUnmount =
      registered.length -
      removeListener.mock.calls.filter(([type]) => type === "keydown").length;
    expect(registered.length).toBeGreaterThan(0);
    expect(activeBeforeUnmount).toBe(1);
    unmount();
    for (const listener of registered) {
      expect(removeListener).toHaveBeenCalledWith("keydown", listener);
    }
    addListener.mockRestore();
    removeListener.mockRestore();
  });

  it("moves between pages through the URL and clears the selection", async () => {
    const user = userEvent.setup();
    renderQueue();
    await waitFor(() => expect(dataRows()).toHaveLength(10));

    await user.click(screen.getAllByRole("checkbox", { name: /^Select action:/ })[0]);
    expect(screen.getByText(/1 action selected/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(screen.getByText("Page 2 of 5 · 47 actions")).toBeTruthy());
    expect(urlStore.get()).toBe("page=2");
    expect(screen.queryByText(/action selected/)).toBeNull();
  });

  it("disables pagination and selection while previous data is shown for a new query", async () => {
    const user = userEvent.setup();
    renderQueue();
    await waitFor(() => expect(dataRows()).toHaveLength(10));

    setActionsScenario({ kind: "ok", delayMs: 300 });
    await user.click(screen.getByRole("button", { name: "Next page" }));

    await waitFor(() => expect(screen.getByText("Updating results…")).toBeTruthy());
    // Old rows are still visible, but nothing can act on them.
    expect(dataRows()).toHaveLength(10);
    const tableRegion = screen.getByRole("region", {
      name: "Pending actions table",
    });
    tableRegion.focus();
    fireEvent.keyDown(tableRegion, { key: "j" });
    expect(document.activeElement).toBe(tableRegion);
    const staleLink = screen.getAllByRole("link")[0];
    staleLink.focus();
    expect(fireEvent.keyDown(staleLink, { key: "Enter" })).toBe(false);
    expect(
      (screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    for (const box of screen.getAllByRole("checkbox")) {
      expect((box as HTMLInputElement).disabled).toBe(true);
    }
    await waitFor(() => expect(screen.getByText("Page 2 of 5 · 47 actions")).toBeTruthy());
  });

  it("filters server-side and resets to page 1", async () => {
    const user = userEvent.setup();
    urlStore.set("page=3");
    renderQueue();
    await waitFor(() => expect(screen.getByText(/Page 3 of 5/)).toBeTruthy());

    await user.selectOptions(screen.getByLabelText("Risk"), "critical");
    await waitFor(() => expect(urlStore.get()).toBe("risk=critical"));
    await waitFor(() => {
      const rows = dataRows();
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(within(row).getByText("Critical")).toBeTruthy();
    });
    expect(screen.getByRole("list", { name: "Active filters" }).textContent).toContain(
      "Risk: Critical",
    );
  });

  it("changes sort order through the URL", async () => {
    const user = userEvent.setup();
    renderQueue();
    await waitFor(() => expect(dataRows()).toHaveLength(10));
    await user.click(screen.getByRole("button", { name: /created/i }));
    await waitFor(() => expect(urlStore.get()).toBe("sort=createdAt"));
    await waitFor(() =>
      expect(
        screen.getByRole("columnheader", { name: /created/i }).getAttribute("aria-sort"),
      ).toBe("ascending"),
    );
  });

  it("explains a filtered-out queue and offers Clear filters", async () => {
    const user = userEvent.setup();
    urlStore.set("q=zzz-nothing");
    renderQueue();

    expect(await screen.findByText("No actions match the current criteria")).toBeTruthy();
    // Both the toolbar and the empty state offer a clear action.
    const clear = screen.getAllByRole("button", { name: "Clear filters" });
    await user.click(clear[clear.length - 1]);

    await waitFor(() => expect(dataRows()).toHaveLength(10));
    expect(urlStore.get()).toBe("");
  });

  it("shows a plain empty state when the queue itself is empty", async () => {
    setActionsScenario({ kind: "empty" });
    renderQueue();
    expect(await screen.findByText("The queue is empty")).toBeTruthy();
    expect(screen.queryByText("No actions match the current criteria")).toBeNull();
  });

  it("shows an error with the request id and recovers on Retry", async () => {
    const user = userEvent.setup();
    setActionsScenario({ kind: "server-error", requestId: "req_abc" });
    renderQueue();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Pending actions could not be loaded");
    expect(alert.textContent).toContain("req_abc");

    resetActionsScenario();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(dataRows()).toHaveLength(10));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("treats a malformed response as an error rather than rendering it", async () => {
    setActionsScenario({ kind: "malformed" });
    renderQueue();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("unexpected format");
  });

  it("falls back to the last page when the requested page is out of range", async () => {
    urlStore.set("page=99");
    renderQueue();
    await waitFor(() => expect(urlStore.get()).toBe("page=5"));
    await waitFor(() => expect(dataRows()).toHaveLength(7));
  });

  it("clears the selection on request and enables bulk decisions", async () => {
    const user = userEvent.setup();
    renderQueue(decisionService(vi.fn()));
    await waitFor(() => expect(dataRows()).toHaveLength(10));

    await user.click(
      screen.getByRole("checkbox", { name: "Select all pending actions on this page" }),
    );
    expect(screen.getByText(/actions? selected on this page/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Approve selected" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByText(/selected on this page/)).toBeNull();
  });

  it("requires explicit confirmation when the A shortcut opens approval", async () => {
    const user = userEvent.setup();
    const bulkDecision = vi.fn(
      async ({ decisions }: Parameters<ActionsService["bulkDecision"]>[0]) => ({
        results: decisions.map((item) => ({
          actionId: item.actionId,
          decision: item.decision,
          outcome: "approved" as const,
          status: "approved" as const,
          recordVersion: item.recordVersion + 1,
          message: "Approval accepted.",
        })),
      }),
    );
    renderQueue(decisionService(bulkDecision));
    await waitFor(() => expect(dataRows()).toHaveLength(10));
    const boxes = screen.getAllByRole("checkbox", { name: /^Select action:/ });
    await user.click(boxes[0]);
    await user.click(boxes[1]);

    const approveButton = screen.getByRole("button", {
      name: "Approve selected",
    });
    const sortButton = screen.getByRole("button", { name: /risk/i });
    sortButton.focus();
    fireEvent.keyDown(sortButton, { key: "a" });
    expect(screen.queryByRole("dialog")).toBeNull();

    approveButton.focus();
    await user.keyboard("a");
    const heading = await screen.findByRole("heading", {
      name: "Confirm bulk approval",
    });
    expect(heading).toBeTruthy();
    const dialog = heading.closest("dialog");
    expect(dialog?.contains(document.activeElement)).toBe(true);
    expect(bulkDecision).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: /Confirm approval of 2 actions/i }),
    );
    await waitFor(() => expect(bulkDecision).toHaveBeenCalledOnce());
    const submitted = bulkDecision.mock.calls[0][0].decisions;
    expect(submitted).toHaveLength(2);
    expect(new Set(submitted.map((item) => item.idempotencyKey)).size).toBe(2);
    expect(
      await screen.findByRole("region", { name: "Bulk decision results" }),
    ).toBeTruthy();
    expect(screen.getAllByText(/approved — Approval accepted/)).toHaveLength(2);
    expect(screen.queryByText(/selected on this page/)).toBeNull();
  });

  it("shows partial outcomes and ignores decision shortcuts in editable fields", async () => {
    const user = userEvent.setup();
    const bulkDecision = vi.fn(
      async ({ decisions }: Parameters<ActionsService["bulkDecision"]>[0]) => ({
        results: decisions.map((item, index) =>
          index === 0
            ? {
                actionId: item.actionId,
                decision: item.decision,
                outcome: "approved" as const,
                status: "approved" as const,
                recordVersion: item.recordVersion + 1,
                message: "Approval accepted.",
              }
            : {
                actionId: item.actionId,
                decision: item.decision,
                outcome: "conflict" as const,
                message: "The action changed after it was loaded.",
              },
        ),
      }),
    );
    renderQueue(decisionService(bulkDecision));
    await waitFor(() => expect(dataRows()).toHaveLength(10));
    const boxes = screen.getAllByRole("checkbox", { name: /^Select action:/ });
    await user.click(boxes[0]);
    await user.click(boxes[1]);

    const search = screen.getByLabelText("Search actions");
    search.focus();
    fireEvent.keyDown(search, { key: "a" });
    expect((search as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("dialog")).toBeNull();

    search.blur();
    await user.click(screen.getByRole("button", { name: "Approve selected" }));
    expect(
      await screen.findByRole("heading", { name: "Confirm bulk approval" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: /Confirm approval of 2 actions/i }),
    );
    await waitFor(() => expect(bulkDecision).toHaveBeenCalledOnce());
    expect(await screen.findByText(/conflict — The action changed/)).toBeTruthy();
    expect(await screen.findByText(/approved — Approval accepted/)).toBeTruthy();
  });

  it("reports unknown outcomes without automatically retrying", async () => {
    const user = userEvent.setup();
    const bulkDecision = vi.fn(
      async (input: Parameters<ActionsService["bulkDecision"]>[0]) => {
        expect(input.decisions).toHaveLength(1);
        throw new ActionsServiceError(
          "unknown-outcome",
          "The decision may or may not have been recorded.",
        );
      },
    );
    renderQueue(decisionService(bulkDecision));
    await waitFor(() => expect(dataRows()).toHaveLength(10));
    await user.click(
      screen.getAllByRole("checkbox", { name: /^Select action:/ })[0],
    );
    await user.click(screen.getByRole("button", { name: "Approve selected" }));
    await user.click(
      screen.getByRole("button", { name: /Confirm approval of 1 action/i }),
    );

    expect(await screen.findByText(/outcome unknown/)).toBeTruthy();
    expect(bulkDecision).toHaveBeenCalledOnce();

    await user.click(
      screen.getAllByRole("checkbox", { name: /^Select action:/ })[0],
    );
    await user.click(screen.getByRole("button", { name: "Approve selected" }));
    await user.click(
      screen.getByRole("button", { name: /Confirm approval of 1 action/i }),
    );
    await waitFor(() => expect(bulkDecision).toHaveBeenCalledTimes(2));
    const firstKey =
      bulkDecision.mock.calls[0][0].decisions[0].idempotencyKey;
    const retryKey =
      bulkDecision.mock.calls[1][0].decisions[0].idempotencyKey;
    expect(retryKey).toBe(firstKey);
  });
});
