import { Dialog } from "@/components/ui/dialog";

const shortcuts = [
  ["J", "Focus the next action on this page"],
  ["K", "Focus the previous action on this page"],
  ["Enter", "Open the focused action"],
  ["Space", "Toggle the focused pending action"],
  ["Ctrl/Cmd + A", "Select all eligible actions on this page"],
  ["Escape", "Close a dialog or clear the queue selection"],
  ["?", "Open this shortcut guide"],
] as const;

export function QueueShortcutHelp({
  open,
  decisionsEnabled,
  onClose,
}: {
  open: boolean;
  decisionsEnabled: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Shortcuts work while focus is in the pending actions table or its selection controls."
    >
      <dl className="space-y-3">
        {shortcuts.map(([key, description]) => (
          <div
            key={key}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
          >
            <dt>
              <kbd className="rounded border border-line-strong bg-surface-muted px-1.5 py-0.5 font-mono text-sm text-fg">
                {key}
              </kbd>
            </dt>
            <dd className="flex-1 text-right text-sm text-fg-muted">
              {description}
            </dd>
          </div>
        ))}
        {decisionsEnabled ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line pt-3">
              <dt>
                <kbd className="rounded border border-line-strong bg-surface-muted px-1.5 py-0.5 font-mono text-sm text-fg">
                  A
                </kbd>
              </dt>
              <dd className="flex-1 text-right text-sm text-fg-muted">
                Open approval confirmation; a separate confirmation is required
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <dt>
                <kbd className="rounded border border-line-strong bg-surface-muted px-1.5 py-0.5 font-mono text-sm text-fg">
                  R
                </kbd>
              </dt>
              <dd className="flex-1 text-right text-sm text-fg-muted">
                Open rejection confirmation; a separate confirmation is required
              </dd>
            </div>
          </>
        ) : null}
      </dl>
      <p className="mt-4 text-meta text-fg-muted">
        J/K stay on the current page. Use the pagination controls to change
        pages. Only pending actions can be selected.
      </p>
    </Dialog>
  );
}
