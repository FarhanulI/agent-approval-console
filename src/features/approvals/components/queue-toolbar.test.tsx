// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueState } from "../types";
import { DEFAULT_SORT } from "../utils/queue-state";
import { QueueToolbar, SEARCH_DEBOUNCE_MS } from "./queue-toolbar";

const baseState: QueueState = {
  search: "",
  status: undefined,
  risk: undefined,
  sort: DEFAULT_SORT,
  page: 1,
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(state: Partial<QueueState> = {}) {
  const onChange = vi.fn();
  const onClear = vi.fn();
  const view = render(
    <QueueToolbar state={{ ...baseState, ...state }} onChange={onChange} onClear={onClear} />,
  );
  return { onChange, onClear, ...view };
}

describe("QueueToolbar", () => {
  it("labels every control", () => {
    setup();
    expect(screen.getByRole("search", { name: "Filter pending actions" })).toBeTruthy();
    expect(screen.getByLabelText("Search actions")).toBeTruthy();
    expect(screen.getByLabelText("Status")).toBeTruthy();
    expect(screen.getByLabelText("Risk")).toBeTruthy();
  });

  it("debounces search so typing does not fire a request per keystroke", () => {
    const { onChange } = setup();
    const input = screen.getByLabelText("Search actions");

    fireEvent.change(input, { target: { value: "c" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50));
    fireEvent.change(input, { target: { value: "cr" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50));
    expect(onChange).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(60));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ search: "cr" });
  });

  it("commits immediately on Enter", () => {
    const { onChange } = setup();
    const input = screen.getByLabelText("Search actions");
    fireEvent.change(input, { target: { value: "tax" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ search: "tax" });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not search for unchanged or whitespace-only text", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText("Search actions"), { target: { value: "   " } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("replaces the draft when the URL value changes externally", () => {
    const { rerender, onChange, onClear } = setup({ search: "invoice" });
    expect((screen.getByLabelText("Search actions") as HTMLInputElement).value).toBe("invoice");
    rerender(<QueueToolbar state={baseState} onChange={onChange} onClear={onClear} />);
    expect((screen.getByLabelText("Search actions") as HTMLInputElement).value).toBe("");
  });

  it("offers only domain enum values and reports a status change", () => {
    const { onChange } = setup();
    const status = screen.getByLabelText("Status") as HTMLSelectElement;
    const values = Array.from(status.options).map((o) => o.value);
    expect(values).toEqual([
      "",
      "pending",
      "approved",
      "rejected",
      "expired",
      "cancelled",
      "executing",
      "executed",
      "failed",
      "conflict",
    ]);
    fireEvent.change(status, { target: { value: "failed" } });
    expect(onChange).toHaveBeenCalledWith({ status: "failed" });
    fireEvent.change(status, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith({ status: undefined });
  });

  it("reports a risk change", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText("Risk"), { target: { value: "critical" } });
    expect(onChange).toHaveBeenCalledWith({ risk: "critical" });
  });

  it("lists active filters and enables Clear filters only when needed", () => {
    const { onClear } = setup({ search: "tax", status: "pending", risk: "high" });
    const list = screen.getByRole("list", { name: "Active filters" });
    expect(list.textContent).toContain("Search: “tax”");
    expect(list.textContent).toContain("Status: Pending");
    expect(list.textContent).toContain("Risk: High");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("disables Clear filters and hides the list when nothing is active", () => {
    setup();
    expect(
      (screen.getByRole("button", { name: "Clear filters" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.queryByRole("list", { name: "Active filters" })).toBeNull();
  });
});
