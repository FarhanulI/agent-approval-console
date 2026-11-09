// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { getQueueDecisionShortcut } from "./queue-shortcuts";

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
});
