export type QueueDecisionShortcut = "approve" | "reject";
export type QueueKeyboardShortcut =
  | QueueDecisionShortcut
  | "next"
  | "previous"
  | "open"
  | "toggle"
  | "selectAll"
  | "clear"
  | "help";

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='reset']):not([type='image']), textarea, select, [contenteditable]:not([contenteditable='false'])",
      ),
    )
  );
}

export function isQueueKeyboardTarget(
  target: EventTarget | null,
  queueRoot: HTMLElement,
  key?: string,
): boolean {
  if (!(target instanceof Element) || !queueRoot.contains(target)) return false;
  if (
    target.closest(
      "input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='reset']):not([type='image']), textarea, select, [contenteditable]:not([contenteditable='false']), dialog[open]",
    )
  ) {
    return false;
  }

  const tableRegion = target.closest('[aria-label="Pending actions table"]');
  const selectedActionsRegion = target.closest(
    '[aria-label="Selected actions"]',
  );
  if (!tableRegion && !selectedActionsRegion) return false;

  const interactive = target.closest("a, button, [role='button']");
  const queueAction = target.closest(
    "a[data-queue-action-link], [data-queue-select]",
  );
  return (
    !interactive ||
    Boolean(queueAction) ||
    Boolean(selectedActionsRegion) ||
    key === "Escape" ||
    key === "?"
  );
}

/** Maps queue keys to UI actions. Decision keys only request confirmation. */
export function getQueueKeyboardShortcut(
  event: KeyboardEvent,
  confirmationOpen: boolean,
): QueueKeyboardShortcut | undefined {
  if (
    confirmationOpen ||
    document.querySelector("dialog[open]") ||
    event.defaultPrevented ||
    event.repeat ||
    event.altKey
  ) {
    return undefined;
  }

  if (isEditableTarget(event.target)) return undefined;

  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) {
    return key === "a" && !event.shiftKey && !(event.ctrlKey && event.metaKey)
      ? "selectAll"
      : undefined;
  }

  switch (key) {
    case "a":
      return "approve";
    case "r":
      return "reject";
    case "j":
      return "next";
    case "k":
      return "previous";
    case "enter":
      return "open";
    case " ":
    case "space":
      return "toggle";
    case "escape":
      return "clear";
    case "?":
      return "help";
    default:
      return undefined;
  }
}

/** Returns the requested confirmation shortcut, never a direct decision. */
export function getQueueDecisionShortcut(
  event: KeyboardEvent,
  confirmationOpen: boolean,
): QueueDecisionShortcut | undefined {
  const shortcut = getQueueKeyboardShortcut(event, confirmationOpen);
  return shortcut === "approve" || shortcut === "reject" ? shortcut : undefined;
}
