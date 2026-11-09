"use client";

import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useBulkDecisionMutation } from "../hooks/use-bulk-decision-mutation";
import { useActionsQuery } from "../hooks/use-actions-query";
import { useQueueUrlState } from "../hooks/use-queue-url-state";
import { actionsService } from "../services";
import { ActionsServiceError } from "../services/actions-service-error";
import type { BulkDecisionOutcome } from "../schemas/bulk-decision";
import type { ActionsService } from "../types";
import { serializeActionListQuery } from "../utils/action-list-query";
import { isSelectable } from "../utils/presentation";
import { getQueueDecisionShortcut } from "../utils/queue-shortcuts";
import {
  clearFilters,
  hasActiveFilters,
  lastPage,
  toActionListQuery,
} from "../utils/queue-state";
import type { PendingAction } from "../contracts";
import { QueueTable } from "./queue-table";
import { QueueToolbar } from "./queue-toolbar";
import { SelectionBar } from "./selection-bar";

const NO_SELECTION: RowSelectionState = {};

type SelectionScope = { queryId: string; ids: RowSelectionState };
type BulkConfirmation = {
  decision: "approve" | "reject";
  actions: readonly PendingAction[];
};
type BulkFeedback = {
  decision: "approve" | "reject";
  items: Array<{
    actionId: string;
    title: string;
    outcome: BulkDecisionOutcome;
    message: string;
  }>;
};

export type PendingActionsQueueProps = {
  /** Injection point for tests; defaults to the app's configured service. */
  service?: ActionsService;
};

export function PendingActionsQueue({ service }: PendingActionsQueueProps) {
  const { state, update } = useQueueUrlState();
  const query = useMemo(() => toActionListQuery(state), [state]);
  const queryId = serializeActionListQuery(query).toString();
  const result = useActionsQuery(query, service);
  const bulkDecision = useBulkDecisionMutation(service);
  const decisionsEnabled = (service ?? actionsService).decisionsEnabled;
  const { data, isPlaceholderData: stale } = result;
  const filtersActive = hasActiveFilters(state);
  const [confirmation, setConfirmation] = useState<BulkConfirmation | null>(null);
  const [feedback, setFeedback] = useState<BulkFeedback | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

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
  const selectedActions = useMemo(
    () => data?.items.filter((action) => rowSelection[action.id]) ?? [],
    [data, rowSelection],
  );

  const openConfirmation = useCallback(
    (decision: "approve" | "reject") => {
      if (
        !decisionsEnabled ||
        bulkDecision.isPending ||
        selectedActions.length === 0
      ) {
        return;
      }
      setBulkError(null);
      setFeedback(null);
      setConfirmation({ decision, actions: selectedActions });
    },
    [decisionsEnabled, bulkDecision.isPending, selectedActions],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !decisionsEnabled ||
        bulkDecision.isPending ||
        selectedActions.length === 0
      ) {
        return;
      }
      const decision = getQueueDecisionShortcut(event, confirmation !== null);
      if (!decision) return;
      event.preventDefault();
      openConfirmation(decision);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    decisionsEnabled,
    bulkDecision.isPending,
    selectedActions,
    confirmation,
    openConfirmation,
  ]);

  const submitBulkDecision = async () => {
    if (!confirmation || bulkDecision.isPending) return;
    const { decision, actions } = confirmation;
    const titles = new Map(actions.map((action) => [action.id, action.title]));
    setConfirmation(null);
    setSelection({ queryId, ids: NO_SELECTION });
    setBulkError(null);
    try {
      const response = await bulkDecision.mutateAsync({
        decisions: actions.map((action) => ({
          actionId: action.id,
          decision,
          recordVersion: action.recordVersion,
        })),
      });
      setFeedback({
        decision,
        items: response.results.map((item) => ({
          actionId: item.actionId,
          title: titles.get(item.actionId) ?? item.actionId,
          outcome: item.outcome,
          message: item.message,
        })),
      });
    } catch (error) {
      if (error instanceof ActionsServiceError && error.kind === "unknown-outcome") {
        setFeedback({
          decision,
          items: actions.map((action) => ({
            actionId: action.id,
            title: action.title,
            outcome: "outcome_unknown",
            message:
              "The decision may or may not have been recorded. Recheck the queue before retrying.",
          })),
        });
      } else {
        setBulkError(
          error instanceof ActionsServiceError
            ? error.message
            : "The bulk decision could not be completed.",
        );
      }
    }
  };

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
        requestId={
          error instanceof ActionsServiceError ? error.requestId : undefined
        }
        action={
          <Button
            onClick={() => void result.refetch()}
            loading={result.isFetching}
          >
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
          decisionsEnabled={decisionsEnabled}
          pending={bulkDecision.isPending}
          onApprove={() => openConfirmation("approve")}
          onReject={() => openConfirmation("reject")}
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
      <QueueToolbar state={state} onChange={update} onClear={handleClear} />
      <p role="status" className="min-h-5 text-meta text-fg-muted">
        {data && (result.isFetching || stale) ? "Updating results…" : ""}
      </p>
      {bulkError ? (
        <div
          role="alert"
          className="rounded-lg border border-danger-soft px-4 py-3 text-sm text-fg"
        >
          {bulkError}
        </div>
      ) : null}
      {feedback ? (
        <section
          aria-label="Bulk decision results"
          aria-live="polite"
          className="space-y-2 rounded-lg border border-line bg-surface px-4 py-3"
        >
          <h2 className="text-sm font-semibold text-fg">
            {feedback.decision === "approve" ? "Approve" : "Reject"} results
          </h2>
          <ul className="space-y-1 text-sm text-fg">
            {feedback.items.map((item) => (
              <li key={item.actionId}>
                <span className="font-medium">{item.title}</span>
                {": "}
                {item.outcome.replace(/_/g, " ")} — {item.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {content}
      <Dialog
        open={confirmation !== null}
        onClose={() => setConfirmation(null)}
        title={
          confirmation?.decision === "approve"
            ? "Confirm bulk approval"
            : "Confirm bulk rejection"
        }
        description="Each selected action is checked and decided independently. Some items may succeed while others conflict or fail."
        closeOnBackdrop={false}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmation(null)}
              disabled={bulkDecision.isPending}
            >
              Cancel
            </Button>
            <Button
              variant={confirmation?.decision === "reject" ? "danger" : "primary"}
              onClick={() => void submitBulkDecision()}
              loading={bulkDecision.isPending}
              disabled={!confirmation || bulkDecision.isPending}
            >
              Confirm{" "}
              {confirmation?.decision === "approve" ? "approval" : "rejection"}
              {confirmation ? ` of ${confirmation.actions.length} actions` : ""}
            </Button>
          </>
        }
      >
        {confirmation ? (
          <div className="space-y-3">
            <p className="text-sm text-fg">
              You are about to{" "}
              {confirmation.decision === "approve" ? "approve" : "reject"}{" "}
              {confirmation.actions.length} selected{" "}
              {confirmation.actions.length === 1 ? "action" : "actions"}:
            </p>
            <ul className="max-h-56 space-y-2 overflow-auto text-sm text-fg">
              {confirmation.actions.map((action) => (
                <li key={action.id}>
                  <span className="font-medium">{action.title}</span>
                  <span className="block text-meta text-fg-muted">
                    {action.targetRecord.label} · version {action.recordVersion}
                  </span>
                </li>
              ))}
            </ul>
            {confirmation.decision === "approve" ? (
              <p className="text-meta text-fg-muted">
                Approval does not mean the action has executed.
              </p>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
