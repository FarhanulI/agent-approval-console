"use client";

import type { RowSelectionState } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useActionsQuery } from "../hooks/use-actions-query";
import { useQueueUrlState } from "../hooks/use-queue-url-state";
import { ActionsServiceError } from "../services/actions-service-error";
import type { ActionsService } from "../types";
import { serializeActionListQuery } from "../utils/action-list-query";
import { isSelectable } from "../utils/presentation";
import {
  clearFilters,
  hasActiveFilters,
  lastPage,
  toActionListQuery,
} from "../utils/queue-state";
import { QueueTable } from "./queue-table";
import { QueueToolbar } from "./queue-toolbar";
import { SelectionBar } from "./selection-bar";

const NO_SELECTION: RowSelectionState = {};

type SelectionScope = { queryId: string; ids: RowSelectionState };

export type PendingActionsQueueProps = {
  /** Injection point for tests; defaults to the app's configured service. */
  service?: ActionsService;
};

export function PendingActionsQueue({ service }: PendingActionsQueueProps) {
  const { state, update } = useQueueUrlState();
  const query = useMemo(() => toActionListQuery(state), [state]);
  const queryId = serializeActionListQuery(query).toString();
  const result = useActionsQuery(query, service);
  const { data, isPlaceholderData: stale } = result;
  const filtersActive = hasActiveFilters(state);

  // Selection belongs to the query it was made under. Changing search, filters,
  // sort or page makes it inapplicable, so it can never leak to other records.
  const [selection, setSelection] = useState<SelectionScope>({
    queryId,
    ids: NO_SELECTION,
  });

  const rowSelection = useMemo(() => {
    if (!data || stale || selection.queryId !== queryId) return NO_SELECTION;
    const selectable = new Set(
      data.items.filter((a) => isSelectable(a.status)).map((a) => a.id),
    );
    const ids: RowSelectionState = {};
    for (const [id, selected] of Object.entries(selection.ids)) {
      if (selected && selectable.has(id)) ids[id] = true;
    }
    return ids;
  }, [data, stale, selection, queryId]);
  const selectedCount = Object.keys(rowSelection).length;

  // A page past the end (e.g. after data shrank) falls back to the last page.
  const outOfRange =
    data !== undefined &&
    !stale &&
    data.items.length === 0 &&
    data.pagination.total > 0 &&
    state.page > 1;
  const fallbackPage = data
    ? lastPage(data.pagination.total, data.pagination.pageSize)
    : 1;
  useEffect(() => {
    if (outOfRange) update({ page: fallbackPage });
  }, [outOfRange, fallbackPage, update]);

  const handleClear = () => update(clearFilters(state));

  let content;
  if (result.isError && !data) {
    const error = result.error;
    content = (
      <ErrorState
        title="Pending actions could not be loaded"
        description={
          error instanceof ActionsServiceError
            ? error.message
            : "An unexpected error occurred while loading actions."
        }
        requestId={error instanceof ActionsServiceError ? error.requestId : undefined}
        action={
          <Button onClick={() => void result.refetch()} loading={result.isFetching}>
            Retry
          </Button>
        }
      />
    );
  } else if (!data || outOfRange) {
    content = <LoadingState label="Loading pending actions" />;
  } else if (data.items.length === 0) {
    content = filtersActive ? (
      <EmptyState
        title="No actions match the current criteria"
        description="Try a different search term, or clear the filters to see the whole queue."
        action={<Button onClick={handleClear}>Clear filters</Button>}
      />
    ) : (
      <EmptyState
        title="The queue is empty"
        description="There are no agent actions waiting for review."
      />
    );
  } else {
    content = (
      <div className="space-y-4">
        {result.isRefetchError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-soft bg-surface px-4 py-3 text-sm text-fg"
          >
            <span>
              The latest refresh failed. You are viewing the last data that
              loaded.
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void result.refetch()}
              loading={result.isFetching}
            >
              Retry
            </Button>
          </div>
        ) : null}
        <SelectionBar
          selectedCount={selectedCount}
          onClear={() => setSelection({ queryId, ids: NO_SELECTION })}
        />
        <QueueTable
          actions={data.items}
          sort={state.sort}
          onSortChange={(sort) => update({ sort })}
          rowSelection={rowSelection}
          onRowSelectionChange={(ids) => setSelection({ queryId, ids })}
          selectionDisabled={stale}
          page={data.pagination.page}
          pageSize={data.pagination.pageSize}
          total={data.pagination.total}
          onPageChange={(page) => update({ page })}
          stale={stale}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <QueueToolbar
        state={state}
        onChange={update}
        onClear={handleClear}
      />
      <p role="status" className="min-h-5 text-meta text-fg-muted">
        {data && (result.isFetching || stale) ? "Updating results…" : ""}
      </p>
      {content}
    </div>
  );
}
