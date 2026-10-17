import { Button } from "@/components/ui/button";

export type SelectionBarProps = {
  selectedCount: number;
  onClear: () => void;
};

const HINT_ID = "bulk-decision-unavailable";

/**
 * Selection foundation only. The bulk-decision contract exists
 * (`bulkDecisionRequestSchema`) but executing decisions is out of scope for
 * this module, so the decision buttons are disabled and never report success.
 */
export function SelectionBar({ selectedCount, onClear }: SelectionBarProps) {
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
        <Button size="sm" disabled aria-describedby={HINT_ID}>
          Approve selected
        </Button>
        <Button size="sm" variant="danger" disabled aria-describedby={HINT_ID}>
          Reject selected
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear selection
        </Button>
      </div>
      <p id={HINT_ID} className="text-meta text-fg-muted">
        Bulk decisions are not available yet. Nothing has been approved or
        rejected.
      </p>
    </section>
  );
}
