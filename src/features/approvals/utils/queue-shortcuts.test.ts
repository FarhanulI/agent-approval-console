// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  getQueueDecisionShortcut,
  getQueueKeyboardShortcut,
  isQueueKeyboardTarget,
} from "./queue-shortcuts";

afterEach(() => {
  document.body.innerHTML = "";
});

function keydown(key: string, target: HTMLElement = document.body) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return getQueueDecisionShortcut(event, false);
}

describe("queue decision shortcuts", () => {
  it("maps A and R to confirmation actions", () => {
    expect(keydown("a")).toBe("approve");
    expect(keydown("R")).toBe("reject");
  });

  it("ignores editable elements and their descendants", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    editable.append(child);

    for (const element of [input, textarea, select]) {
      expect(keydown("a", element)).toBeUndefined();
    }
    document.body.append(editable);
    expect(keydown("a", editable)).toBeUndefined();
    expect(keydown("a", child)).toBeUndefined();
  });

  it("ignores modifiers and open confirmation dialogs", () => {
    const modified = new KeyboardEvent("keydown", {
      key: "a",
      ctrlKey: true,
      bubbles: true,
    });
    document.body.dispatchEvent(modified);
    expect(getQueueDecisionShortcut(modified, false)).toBeUndefined();
    expect(keydown("a")).toBe("approve");
    expect(getQueueDecisionShortcut(new KeyboardEvent("keydown", { key: "r" }), true))
      .toBeUndefined();
  });

  it("ignores shortcuts while any native dialog is open", () => {
    const dialog = document.createElement("dialog");
    dialog.open = true;
    document.body.append(dialog);
    expect(keydown("r")).toBeUndefined();
  });

  it("maps navigation, selection, open, clear, and help keys", () => {
    const shortcut = (key: string) =>
      getQueueKeyboardShortcut(
        new KeyboardEvent("keydown", { key, cancelable: true }),
        false,
      );

    expect(shortcut("j")).toBe("next");
    expect(shortcut("K")).toBe("previous");
    expect(shortcut("Enter")).toBe("open");
    expect(shortcut(" ")).toBe("toggle");
    expect(shortcut("Escape")).toBe("clear");
    expect(shortcut("?")).toBe("help");
    expect(
      getQueueKeyboardShortcut(
        new KeyboardEvent("keydown", { key: "a", ctrlKey: true }),
        false,
      ),
    ).toBe("selectAll");
    expect(
      getQueueKeyboardShortcut(
        new KeyboardEvent("keydown", { key: "a", metaKey: true }),
        false,
      ),
    ).toBe("selectAll");
  });

  it("does not override unrelated modifier shortcuts or repeated keys", () => {
    expect(
      getQueueKeyboardShortcut(
        new KeyboardEvent("keydown", { key: "j", ctrlKey: true }),
        false,
      ),
    ).toBeUndefined();
    expect(
      getQueueKeyboardShortcut(
        new KeyboardEvent("keydown", { key: "a", ctrlKey: true, shiftKey: true }),
        false,
      ),
    ).toBeUndefined();
    expect(
      getQueueKeyboardShortcut(
        new KeyboardEvent("keydown", { key: "j", repeat: true }),
        false,
      ),
    ).toBeUndefined();
  });

  it("limits shortcuts to queue actions and ignores editable fields and dialogs", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div aria-label="Pending actions table">
        <a data-queue-action-link>Action</a>
        <input type="checkbox" data-queue-select />
        <button>Sort column</button>
        <input type="text" />
      </div>
      <button>Unrelated control</button>
      <dialog open><button>Dialog control</button></dialog>
    `;
    document.body.append(root);
    const region = root.querySelector('[aria-label="Pending actions table"]')!;
    const link = root.querySelector("a")!;
    const checkbox = root.querySelector<HTMLInputElement>("[data-queue-select]")!;
    const textInput = root.querySelector<HTMLInputElement>('input[type="text"]')!;
    const outsideButton = root.querySelectorAll("button")[1]!;
    const sortButton = root.querySelector("div button")!;
    const dialogButton = root.querySelector("dialog button")!;
    const unrelatedRoot = document.createElement("section");
    document.body.append(unrelatedRoot);

    expect(isQueueKeyboardTarget(region, root)).toBe(true);
    expect(isQueueKeyboardTarget(link, root)).toBe(true);
    expect(isQueueKeyboardTarget(checkbox, root)).toBe(true);
    expect(isQueueKeyboardTarget(textInput, root)).toBe(false);
    expect(isQueueKeyboardTarget(outsideButton, root)).toBe(false);
    expect(isQueueKeyboardTarget(sortButton, root, "j")).toBe(false);
    expect(isQueueKeyboardTarget(sortButton, root, "Escape")).toBe(true);
    expect(isQueueKeyboardTarget(dialogButton, root)).toBe(false);
    expect(isQueueKeyboardTarget(link, unrelatedRoot)).toBe(false);
  });
});
