// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { handlers } from "@/mocks/handlers";
import {
  resetActionsScenario,
  setActionsScenario,
} from "@/mocks/handlers/actions";
import { createHttpActionsService } from "../services/actions-service";
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

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => urlStore.set(""));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetActionsScenario();
});
afterAll(() => server.close());

function renderQueue() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PendingActionsQueue service={service} />
    </QueryClientProvider>,
  );
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

  it("clears the selection on request and never enables bulk decisions", async () => {
    const user = userEvent.setup();
    renderQueue();
    await waitFor(() => expect(dataRows()).toHaveLength(10));

    await user.click(
      screen.getByRole("checkbox", { name: "Select all pending actions on this page" }),
    );
    expect(screen.getByText(/actions? selected on this page/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Approve selected" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByText(/selected on this page/)).toBeNull();
  });
});
