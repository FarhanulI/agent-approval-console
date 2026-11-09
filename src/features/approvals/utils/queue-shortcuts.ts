export type QueueDecisionShortcut = "approve" | "reject";

/** Returns the requested confirmation shortcut, never a direct decision. */
export function getQueueDecisionShortcut(
  event: KeyboardEvent,
  confirmationOpen: boolean,
): QueueDecisionShortcut | undefined {
  if (
    confirmationOpen ||
    document.querySelector("dialog[open]") ||
    event.defaultPrevented ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return undefined;
  }

  const target = event.target;
  if (
    target instanceof Element &&
    target.closest(
      "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
    )
  ) {
    return undefined;
  }

  switch (event.key.toLowerCase()) {
    case "a":
      return "approve";
    case "r":
      return "reject";
    default:
      return undefined;
  }
}
