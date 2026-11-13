# Module 11B: Pending Actions Queue Keyboard Shortcuts

## Goal and boundary

Improve navigation and selection in the Pending Actions Queue without changing
the approval contract, decision lifecycle, or backend. This is a
bridge-independent UI capability. It adds no API endpoints or dependencies.

## Shortcut behavior

Shortcuts apply while focus is in the Pending Actions table or its selection
controls. They do not run from editable fields, unrelated controls, or an open
dialog.

| Key | Behavior |
| --- | --- |
| `J` / `K` | Move focus to the next / previous action link on the current page. |
| `Enter` | Open the focused action. A focused table region opens the selected action, or the first visible action if none is selected. |
| `Space` | Toggle the focused action if it is pending and selectable. A focused checkbox keeps its native Space behavior. |
| `Ctrl+A` / `Cmd+A` | Select all eligible pending actions visible on the current page. |
| `Escape` | Close an active native dialog; otherwise clear the current queue selection. |
| `?` | Open the keyboard shortcut guide. |
| `A` / `R` | Preserve Module 11A behavior: open approval / rejection confirmation only. A second explicit confirmation is always required. |

J/K navigation does not fetch another page or wrap at page boundaries; use the
existing pagination controls. Filtering and page changes keep their existing
URL-driven behavior and clear the previous page's selection. During stale or
loading results, row navigation and selection shortcuts do not act. A refreshed
response clears the previous snapshot's selection, so old selections cannot
reappear if an action later becomes pending again.

## Accessibility and safety

- The help is available through a visible button and `?`.
- J/K moves actual keyboard focus to the action link, so its label is announced
  by assistive technology and standard focus-visible styling remains active.
- Selection remains available through labelled native checkboxes; the selected
  count continues to be announced through a live status.
- Shortcut handling is queue-scoped and ignores editable fields, unrelated
  controls, repeated key events, Alt-modified shortcuts, and open dialogs.
  Ctrl/Cmd+A is the only supported Ctrl/Cmd-modified shortcut.
- Decision shortcuts never submit a decision. The existing confirmation
  identifies the decision and affected action count, and prevents duplicate
  submissions while processing.

## Implementation and tests

Keyboard mapping and scope guards live in `src/features/approvals/utils`.
Queue focus, selection, and decision confirmation reuse the existing
`PendingActionsQueue`, table, and service state. The shortcut guide reuses the
native dialog component.

Coverage includes shortcut mapping and guards, J/K focus movement, Enter, Space,
Ctrl/Cmd+A, Escape, help open/close, editable-field suppression, selection
clearing after refreshed data, stale data, listener cleanup, confirmation
safety, and mock-backed Playwright navigation and selection.

No behavior is inferred for `erp-mcp-bridge`. Module 11A bulk decisions remain
mock-backed and non-durable as documented in
[`module-11a-bulk-decisions.md`](./module-11a-bulk-decisions.md).
