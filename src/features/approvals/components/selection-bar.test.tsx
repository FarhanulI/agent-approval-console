// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionBar } from "./selection-bar";

afterEach(cleanup);

describe("SelectionBar", () => {
  const props = {
    decisionsEnabled: true,
    pending: false,
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onClear: vi.fn(),
  };

  it("renders nothing without a selection", () => {
    const { container } = render(<SelectionBar {...props} selectedCount={0} />);
    expect(container.textContent).toBe("");
  });

  it("states how many actions are selected", () => {
    render(<SelectionBar {...props} selectedCount={3} />);
    expect(screen.getByRole("status").textContent).toContain("3 actions selected");
    render(<SelectionBar {...props} selectedCount={1} />);
    expect(screen.getAllByRole("status")[1].textContent).toContain("1 action selected");
  });

  it("exposes enabled decisions and their confirmation shortcuts", async () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <SelectionBar
        {...props}
        onApprove={onApprove}
        onReject={onReject}
        selectedCount={2}
      />,
    );
    const approve = screen.getByRole("button", { name: "Approve selected" });
    const reject = screen.getByRole("button", { name: "Reject selected" });
    expect(approve.getAttribute("aria-keyshortcuts")).toBe("A");
    expect(reject.getAttribute("aria-keyshortcuts")).toBe("R");
    expect(screen.getByText(/A opens approve confirmation/)).toBeTruthy();
    await userEvent.click(approve);
    await userEvent.click(reject);
    expect(onApprove).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledOnce();
  });

  it("disables decisions when unavailable or while a request is pending", () => {
    const { rerender } = render(
      <SelectionBar {...props} decisionsEnabled={false} selectedCount={2} />,
    );
    expect(
      (screen.getByRole("button", { name: "Approve selected" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText("Decisions are unavailable in this environment.")).toBeTruthy();

    rerender(<SelectionBar {...props} pending selectedCount={2} />);
    expect(
      (screen.getByRole("button", { name: "Reject selected" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("clears the selection", async () => {
    const onClear = vi.fn();
    render(<SelectionBar {...props} selectedCount={2} onClear={onClear} />);
    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
