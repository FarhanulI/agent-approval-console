// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionFixtures } from "@/mocks/fixtures/actions";
import { QueueTable, type QueueTableProps } from "./queue-table";

afterEach(cleanup);

const rows = actionFixtures.slice(0, 10);
const pendingRows = rows.filter((a) => a.status === "pending");
const nonPendingRow = rows.find((a) => a.status !== "pending")!;

function setup(overrides: Partial<QueueTableProps> = {}) {
  const props: QueueTableProps = {
    actions: rows,
    sort: { field: "createdAt", direction: "desc" },
    onSortChange: vi.fn(),
    rowSelection: {},
    onRowSelectionChange: vi.fn(),
    selectionDisabled: false,
    page: 1,
    pageSize: 10,
    total: 47,
    onPageChange: vi.fn(),
    stale: false,
    ...overrides,
  };
  render(<QueueTable {...props} />);
  return props;
}

describe("QueueTable", () => {
  it("renders semantic table markup with a row per action", () => {
    setup();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").length).toBeGreaterThan(5);
    expect(within(table).getAllByRole("row")).toHaveLength(rows.length + 1);
    for (const header of ["Action", "Target record", "Agent / run", "Risk", "Status"]) {
      expect(within(table).getByRole("columnheader", { name: header })).toBeTruthy();
    }
  });

  it("links each title to its action detail route using the real id", () => {
    setup();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(rows.length);
    // Titles repeat across fixtures, so identity is checked through the href.
    expect(links.map((l) => l.getAttribute("href"))).toEqual(
      rows.map((a) => `/approvals/${a.id}`),
    );
  });

  it("encodes unsafe ids in the detail URL", () => {
    setup({ actions: [{ ...rows[0], id: "a/b?c#d" }] });
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "/approvals/a%2Fb%3Fc%23d",
    );
  });

  it("shows risk and status as text, not colour alone", () => {
    setup({ actions: [{ ...rows[0], status: "conflict", risk: "critical" }] });
    const row = screen.getAllByRole("row")[1];
    expect(within(row).getByText("Critical")).toBeTruthy();
    expect(within(row).getByText("Conflict")).toBeTruthy();
  });

  it("falls back readably when optional fields are missing", () => {
    setup({ actions: [{ ...rows[0], runId: undefined, agent: undefined }] });
    expect(screen.getByText("Unknown agent")).toBeTruthy();
    expect(screen.getByText("No run linked")).toBeTruthy();
  });

  it("formats timestamps in a <time> element with the ISO value", () => {
    setup({ actions: [rows[0]] });
    const time = document.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe(rows[0].createdAt);
  });

  it("exposes the sort state to assistive technology", () => {
    setup({ sort: { field: "risk", direction: "asc" } });
    expect(
      screen.getByRole("columnheader", { name: /risk/i }).getAttribute("aria-sort"),
    ).toBe("ascending");
    expect(
      screen.getByRole("columnheader", { name: /created/i }).getAttribute("aria-sort"),
    ).toBe("none");
    expect(
      screen.getByRole("columnheader", { name: "Status" }).hasAttribute("aria-sort"),
    ).toBe(false);
  });

  it("requests a server sort when a sortable header is activated", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: /risk/i }));
    expect(props.onSortChange).toHaveBeenCalledOnce();
    // Not currently sorted by risk, so TanStack starts with its first direction.
    expect(vi.mocked(props.onSortChange).mock.calls[0][0].field).toBe("risk");
  });

  it("toggles direction when the active sort column is clicked", async () => {
    const props = setup({ sort: { field: "createdAt", direction: "desc" } });
    await userEvent.click(screen.getByRole("button", { name: /created/i }));
    expect(props.onSortChange).toHaveBeenCalledWith({
      field: "createdAt",
      direction: "asc",
    });
  });

  it("does not render sort buttons for non-sortable columns", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Status" })).toBeNull();
    expect(screen.queryByRole("button", { name: /target/i })).toBeNull();
  });

  it("makes only pending actions selectable, with meaningful names", () => {
    setup();
    const pendingBox = screen.getByRole("checkbox", {
      name: `Select action: ${pendingRows[0].title} for ${pendingRows[0].targetRecord.label}`,
    });
    expect((pendingBox as HTMLInputElement).disabled).toBe(false);

    const blocked = screen.getByRole("checkbox", {
      name: new RegExp(`Action not selectable \\(${nonPendingRow.status}\\)`),
    });
    expect((blocked as HTMLInputElement).disabled).toBe(true);
  });

  it("reports selection by stable action id", async () => {
    const props = setup();
    await userEvent.click(
      screen.getAllByRole("checkbox", { name: /^Select action:/ })[0],
    );
    expect(props.onRowSelectionChange).toHaveBeenCalledWith({
      [pendingRows[0].id]: true,
    });
  });

  it("select-all picks only selectable rows", async () => {
    const props = setup();
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select all pending actions on this page" }),
    );
    const selected = vi.mocked(props.onRowSelectionChange).mock.calls[0][0];
    expect(Object.keys(selected).sort()).toEqual(pendingRows.map((a) => a.id).sort());
  });

  it("reflects an existing selection", () => {
    setup({ rowSelection: { [pendingRows[0].id]: true } });
    const box = screen.getByRole("checkbox", {
      name: `Select action: ${pendingRows[0].title} for ${pendingRows[0].targetRecord.label}`,
    }) as HTMLInputElement;
    expect(box.checked).toBe(true);
  });

  it("disables all selection while data is stale", () => {
    setup({ selectionDisabled: true, stale: true });
    for (const box of screen.getAllByRole("checkbox")) {
      expect((box as HTMLInputElement).disabled).toBe(true);
    }
    expect(screen.getByRole("table").getAttribute("aria-busy")).toBe("true");
  });

  it("wraps the table in a scrollable, focusable, labelled region", () => {
    setup();
    const region = screen.getByRole("region", { name: "Pending actions table" });
    expect(region.getAttribute("tabindex")).toBe("0");
  });

  describe("pagination", () => {
    it("shows page and totals from response metadata", () => {
      setup({ page: 2, total: 47 });
      expect(screen.getByText("Page 2 of 5 · 47 actions")).toBeTruthy();
    });

    it("disables Previous on the first page and navigates forward", async () => {
      const props = setup({ page: 1 });
      expect(
        (screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled,
      ).toBe(true);
      await userEvent.click(screen.getByRole("button", { name: "Next page" }));
      expect(props.onPageChange).toHaveBeenCalledWith(2);
    });

    it("disables Next on the last page and navigates back", async () => {
      const props = setup({ page: 5, total: 47 });
      expect(
        (screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled,
      ).toBe(true);
      await userEvent.click(screen.getByRole("button", { name: "Previous page" }));
      expect(props.onPageChange).toHaveBeenCalledWith(4);
    });

    it("disables both controls while stale", () => {
      setup({ page: 2, stale: true });
      expect(
        (screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(
        (screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled,
      ).toBe(true);
    });
  });
});
