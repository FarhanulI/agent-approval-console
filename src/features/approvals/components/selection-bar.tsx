import { Button } from "@/components/ui/button";

export type SelectionBarProps = {
  selectedCount: number;
  decisionsEnabled: boolean;
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
  onClear: () => void;
};

export function SelectionBar({
  selectedCount,
  decisionsEnabled,
  pending,
  onApprove,
  onReject,
  onClear,
}: SelectionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <section
      aria-label="Selected actions"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-surface-muted px-4 py-3"
    >
      <p className="text-sm font-medium text-fg" role="status">
        {selectedCount} {selectedCount === 1 ? "action" : "actions"} selected
        on this page
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!decisionsEnabled || pending}
          aria-keyshortcuts="A"
          onClick={onApprove}
        >
          Approve selected
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={!decisionsEnabled || pending}
          aria-keyshortcuts="R"
          onClick={onReject}
        >
          Reject selected
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClear}
          disabled={pending}
        >
          Clear selection
        </Button>
      </div>
      <p className="text-meta text-fg-muted">
        {decisionsEnabled
          ? "Shortcuts: A opens approve confirmation; R opens reject confirmation. Confirmation is always required."
          : "Decisions are unavailable in this environment."}
      </p>
    </section>
  );
}
