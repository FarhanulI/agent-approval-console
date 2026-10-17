import { Button } from "@/components/ui/button";

export type QueuePaginationProps = {
  page: number;
  pageCount: number;
  total: number;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  /** Disabled while displayed rows are stale relative to the URL. */
  disabled?: boolean;
};

export function QueuePagination({
  page,
  pageCount,
  total,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  disabled = false,
}: QueuePaginationProps) {
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-fg-muted">
        Page {page} of {Math.max(pageCount, 1)} · {total}{" "}
        {total === 1 ? "action" : "actions"}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onPrevious}
          disabled={disabled || !canPrevious}
          aria-label="Previous page"
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onNext}
          disabled={disabled || !canNext}
          aria-label="Next page"
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
