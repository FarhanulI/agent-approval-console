// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionBar } from "./selection-bar";

afterEach(cleanup);

describe("SelectionBar", () => {
  it("renders nothing without a selection", () => {
    const { container } = render(<SelectionBar selectedCount={0} onClear={vi.fn()} />);
    expect(container.textContent).toBe("");
  });

  it("states how many actions are selected", () => {
    render(<SelectionBar selectedCount={3} onClear={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain("3 actions selected");
    render(<SelectionBar selectedCount={1} onClear={vi.fn()} />);
    expect(screen.getAllByRole("status")[1].textContent).toContain("1 action selected");
  });

  it("keeps bulk decisions disabled and never claims success", () => {
    render(<SelectionBar selectedCount={2} onClear={vi.fn()} />);
    const approve = screen.getByRole("button", { name: "Approve selected" }) as HTMLButtonElement;
    const reject = screen.getByRole("button", { name: "Reject selected" }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(reject.disabled).toBe(true);
    expect(approve.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText(/not available yet/i).textContent).toContain("Nothing has been approved");
  });

  it("clears the selection", async () => {
    const onClear = vi.fn();
    render(<SelectionBar selectedCount={2} onClear={onClear} />);
    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
