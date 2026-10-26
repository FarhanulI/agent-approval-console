// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionsServiceError } from "@/features/approvals/services/actions-service-error";
import type { AuditEventDto } from "../schemas/audit-event";
import type { AuditService } from "../types";
import { AuditLog } from "./audit-log";

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
    usePathname: () => "/audit",
    useRouter: () => ({ replace: (url: string) => urlStore.set(url.split("?")[1] ?? "") }),
    useSearchParams: () => {
      const search = React.useSyncExternalStore(urlStore.subscribe, urlStore.get, urlStore.get);
      return React.useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});

const make = (n: number, patch: Partial<AuditEventDto> = {}): AuditEventDto => ({
  id: `evt_${n}`,
  eventType: "decision.accepted",
  outcome: "success",
  occurredAt: "2026-10-01T08:00:00.000Z",
  actorType: "user",
  actorId: "usr_1",
  actionId: `act_${n}`,
  summary: `Summary ${n}`,
  ...patch,
});

function fakeService(overrides: Partial<AuditService> = {}): AuditService {
  return {
    listEvents: vi.fn(async () => ({
      items: [
        make(1),
        make(2, { eventType: "decision.outcome_unknown", outcome: "unknown", summary: "<img src=x onerror=alert(1)>" }),
      ],
      pagination: { page: 1, pageSize: 10, total: 25 },
    })),
    getEvent: vi.fn(async (id: string) => make(Number(id.replace("evt_", "")))),
    ...overrides,
  };
}

function renderLog(service: AuditService) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <AuditLog service={service} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  urlStore.set("");
  // jsdom has no modal <dialog> support.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => cleanup());

describe("AuditLog", () => {
  it("shows loading, then rows with badges, UTC time and an action link", async () => {
    renderLog(fakeService());
    expect(screen.getByText("Loading audit events")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
    expect(screen.getByText("Page 1 of 3 · 25 events")).toBeTruthy();
    expect(screen.getByRole("link", { name: "act_1" }).getAttribute("href")).toBe("/approvals/act_1");
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/UTC$/).length).toBeGreaterThan(0);
  });

  it("renders untrusted summaries as text, not HTML", async () => {
    const { container } = renderLog(fakeService());
    await screen.findByText("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img")).toBeNull();
  });

  it("reflects filters in the URL and offers clear filters", async () => {
    const user = userEvent.setup();
    const service = fakeService();
    renderLog(service);
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
    await user.selectOptions(screen.getByLabelText("Outcome"), "unknown");
    expect(urlStore.get()).toBe("outcome=unknown");
    await waitFor(() =>
      expect(service.listEvents).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: "unknown", page: 1 }), expect.anything()),
    );
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(urlStore.get()).toBe("");
  });

  it("changes sort direction and page through the URL", async () => {
    const user = userEvent.setup();
    renderLog(fakeService());
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
    await user.click(screen.getByRole("button", { name: /Time/ }));
    expect(urlStore.get()).toBe("sort=asc");
    await user.click(await screen.findByRole("button", { name: "Next page" }));
    expect(urlStore.get()).toBe("sort=asc&page=2");
  });

  it("shows the initial-empty and no-results states", async () => {
    const empty = fakeService({
      listEvents: vi.fn(async () => ({ items: [], pagination: { page: 1, pageSize: 10, total: 0 } })),
    });
    renderLog(empty);
    expect(await screen.findByText("No audit events yet")).toBeTruthy();
    cleanup();
    urlStore.set("q=zzz");
    renderLog(empty);
    expect(await screen.findByText("No events match the current criteria")).toBeTruthy();
  });

  it("shows an error with request id and retries on demand", async () => {
    const listEvents = vi
      .fn()
      .mockRejectedValueOnce(new ActionsServiceError("http", "Boom", { status: 502, requestId: "req_abc" }))
      .mockResolvedValue({ items: [make(1)], pagination: { page: 1, pageSize: 10, total: 1 } });
    const user = userEvent.setup();
    renderLog(fakeService({ listEvents }));
    expect(await screen.findByText("Audit events could not be loaded")).toBeTruthy();
    expect(screen.getByText(/req_abc/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
    expect(listEvents).toHaveBeenCalledTimes(2);
  });

  it("opens the detail dialog through the detail service and states unknown outcomes", async () => {
    const user = userEvent.setup();
    const service = fakeService({
      getEvent: vi.fn(async () => make(2, { eventType: "decision.outcome_unknown", outcome: "unknown", requestId: "req_9", details: { reasonProvided: true } })),
    });
    renderLog(service);
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
    await user.click(screen.getByRole("button", { name: "View details for event evt_2" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/outcome was not confirmed/i)).toBeTruthy();
    expect(within(dialog).getByText("Yes (not shown)")).toBeTruthy();
    expect(service.getEvent).toHaveBeenCalledWith("evt_2", expect.anything());
  });

  it("shows a safe not-found message in the dialog", async () => {
    const user = userEvent.setup();
    renderLog(
      fakeService({ getEvent: vi.fn(async () => { throw new ActionsServiceError("not-found", "nope", { status: 404 }); }) }),
    );
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
    await user.click(screen.getByRole("button", { name: "View details for event evt_1" }));
    expect(await screen.findByText(/could not be found or is not available/i)).toBeTruthy();
  });
});
