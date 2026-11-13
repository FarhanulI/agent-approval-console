"use client";

import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  getQueueKeyboardShortcut,
  isQueueKeyboardTarget,
} from "../utils/queue-shortcuts";
import {
  clearFilters,
  hasActiveFilters,
  lastPage,
  toActionListQuery,
} from "../utils/queue-state";
import type { ActionListResponse, PendingAction } from "../contracts";
import { QueueTable } from "./queue-table";
import { QueueShortcutHelp } from "./queue-shortcut-help";
import { QueueToolbar } from "./queue-toolbar";
import { SelectionBar } from "./selection-bar";

const NO_SELECTION: RowSelectionState = {};

type SelectionScope = {
  queryId: string;
  dataSnapshot: ActionListResponse | undefined;
  ids: RowSelectionState;
};
type BulkConfirmation = {
  decision: "approve" | "reject";
  actions: readonly PendingAction[];
  dataSnapshot: ActionListResponse;
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
  const rowsAvailable = Boolean(
    data && !stale && !result.isFetching && !result.isRefetchError,
  );
  const filtersActive = hasActiveFilters(state);
  const [confirmation, setConfirmation] = useState<BulkConfirmation | null>(null);
  const [feedback, setFeedback] = useState<BulkFeedback | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const queueRootRef = useRef<HTMLDivElement>(null);
  const focusedActionIdRef = useRef<string | null>(null);

  // Selection belongs to both its query and exact data snapshot.
  const [selection, setSelection] = useState<SelectionScope>({
    queryId,
    dataSnapshot: data,
    ids: NO_SELECTION,
  });

  const rowSelection = useMemo(() => {
    if (
      !data ||
      !rowsAvailable ||
      selection.queryId !== queryId ||
      selection.dataSnapshot !== data
    ) {
      return NO_SELECTION;
    }
    const selectable = new Set(
      data.items.filter((a) => isSelectable(a.status)).map((a) => a.id),
    );
    const ids: RowSelectionState = {};
    for (const [id, selected] of Object.entries(selection.ids)) {
      if (selected && selectable.has(id)) ids[id] = true;
    }
    return ids;
  }, [data, rowsAvailable, selection, queryId]);

  const selectedCount = Object.keys(rowSelection).length;
  const selectedActions = useMemo(
    () => data?.items.filter((action) => rowSelection[action.id]) ?? [],
    [data, rowSelection],
  );
  const activeConfirmation =
    confirmation &&
    confirmation.dataSnapshot === data &&
    rowsAvailable
      ? confirmation
      : null;

  const openConfirmation = useCallback(
    (decision: "approve" | "reject") => {
      if (
        !decisionsEnabled ||
        bulkDecision.isPending ||
        !rowsAvailable ||
        !data ||
        selectedActions.length === 0
      ) {
        return;
      }
      setBulkError(null);
      setFeedback(null);
      setConfirmation({ decision, actions: selectedActions, dataSnapshot: data });
    },
    [decisionsEnabled, bulkDecision.isPending, selectedActions, data, rowsAvailable],
  );

  useEffect(() => {
    focusedActionIdRef.current = null;
  }, [queryId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const root = queueRootRef.current;
      if (!root || !isQueueKeyboardTarget(event.target, root, event.key)) return;

      const shortcut = getQueueKeyboardShortcut(
        event,
        activeConfirmation !== null || shortcutHelpOpen,
      );
      if (!shortcut) return;

      const target = event.target instanceof Element ? event.target : null;
      const tableRegion = target?.closest<HTMLElement>(
        '[aria-label="Pending actions table"]',
      );
      const selectedActionsRegion = target?.closest<HTMLElement>(
        '[aria-label="Selected actions"]',
      );
      const activeRow = target?.closest<HTMLElement>("[data-queue-action-id]");
      const currentActionId =
        activeRow?.dataset.queueActionId ?? focusedActionIdRef.current;
      const links = Array.from(
        root.querySelectorAll<HTMLAnchorElement>("a[data-queue-action-link]"),
      );
      const eligibleActions = (data?.items ?? []).filter((action) =>
        isSelectable(action.status),
      );
      const findLink = (actionId: string | undefined) =>
        actionId
          ? links.find((link) => link.dataset.actionId === actionId)
          : undefined;

      if (shortcut === "help") {
        event.preventDefault();
        setShortcutHelpOpen(true);
        return;
      }

      if (shortcut === "approve" || shortcut === "reject") {
        if (
          !decisionsEnabled ||
          bulkDecision.isPending ||
          selectedActions.length === 0
        ) {
          return;
        }
        if (
          !tableRegion &&
          !selectedActionsRegion &&
          !target?.closest("[data-queue-action-link], [data-queue-select]")
        ) {
          return;
        }
        event.preventDefault();
        openConfirmation(shortcut);
        return;
      }

      if (shortcut === "clear") {
        if (Object.values(selection.ids).some(Boolean)) {
          event.preventDefault();
          setSelection({
            queryId,
            dataSnapshot: data,
            ids: NO_SELECTION,
          });
        }
        return;
      }

      if (!data || !rowsAvailable) {
        if (
          shortcut === "open" &&
          target?.closest("a[data-queue-action-link]")
        ) {
          event.preventDefault();
        }
        return;
      }

      if (shortcut === "next" || shortcut === "previous") {
        const currentIndex = links.findIndex(
          (link) => link.dataset.actionId === currentActionId,
        );
        const nextIndex =
          currentIndex < 0
            ? shortcut === "next"
              ? 0
              : links.length - 1
            : currentIndex + (shortcut === "next" ? 1 : -1);
        const nextLink = links[nextIndex];
        if (!nextLink) return;
        event.preventDefault();
        focusedActionIdRef.current = nextLink.dataset.actionId ?? null;
        nextLink.focus();
        return;
      }

      if (shortcut === "open") {
        if (
          target?.closest("[data-queue-select]") &&
          !target.closest("[data-queue-action-id]")
        ) {
          return;
        }
        const actionLink = target?.closest<HTMLAnchorElement>(
          "a[data-queue-action-link]",
        );
        if (!tableRegion && !target?.closest("[data-queue-select]") && !actionLink) {
          return;
        }
        const actionId =
          currentActionId ??
          selectedActions[0]?.id ??
          data.items[0]?.id;
        const link = actionLink ?? findLink(actionId);
        if (!link) return;
        event.preventDefault();
        focusedActionIdRef.current = link.dataset.actionId ?? actionId ?? null;
        link.click();
        return;
      }

      if (shortcut === "toggle") {
        if (target?.closest("[data-queue-select]")) return;
        if (
          !tableRegion &&
          !target?.closest("a[data-queue-action-link]")
        ) {
          return;
        }
        const actionId =
          currentActionId ??
          selectedActions[0]?.id ??
          eligibleActions[0]?.id;
        const rowCheckbox = actionId
          ? Array.from(
              root.querySelectorAll<HTMLElement>("[data-queue-action-id]"),
            )
              .find((row) => row.dataset.queueActionId === actionId)
              ?.querySelector<HTMLInputElement>("[data-queue-select]")
          : null;
        if (!rowCheckbox || rowCheckbox.disabled) return;
        event.preventDefault();
        focusedActionIdRef.current = actionId ?? null;
        rowCheckbox.click();
        return;
      }

      if (shortcut === "selectAll") {
        if (!tableRegion) return;
        event.preventDefault();
        const ids: RowSelectionState = {};
        for (const action of eligibleActions) ids[action.id] = true;
        setSelection({ queryId, dataSnapshot: data, ids });
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    decisionsEnabled,
    bulkDecision.isPending,
    selectedActions,
    selection.ids,
    activeConfirmation,
    shortcutHelpOpen,
    openConfirmation,
    data,
    rowsAvailable,
    queryId,
  ]);

  const submitBulkDecision = async () => {
    if (
      !activeConfirmation ||
      activeConfirmation.dataSnapshot !== data ||
      stale ||
      bulkDecision.isPending
    ) {
      return;
    }
    const { decision, actions } = activeConfirmation;
    const titles = new Map(actions.map((action) => [action.id, action.title]));
    setConfirmation(null);
    setSelection({
      queryId,
      dataSnapshot: data,
      ids: NO_SELECTION,
    });
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
          onClear={() =>
            setSelection({
              queryId,
              dataSnapshot: data,
              ids: NO_SELECTION,
            })
          }
        />
        <QueueTable
          actions={data.items}
          sort={state.sort}
          onSortChange={(sort) => update({ sort })}
          rowSelection={rowSelection}
          onRowSelectionChange={(ids) =>
            setSelection({
              queryId,
              dataSnapshot: data,
              ids,
            })
          }
          selectionDisabled={!rowsAvailable}
          page={data.pagination.page}
          pageSize={data.pagination.pageSize}
          total={data.pagination.total}
          onPageChange={(page) => update({ page })}
          stale={stale || result.isFetching}
        />
      </div>
    );
  }

  return (
    <div ref={queueRootRef} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <QueueToolbar state={state} onChange={update} onClear={handleClear} />
        <Button
          variant="secondary"
          aria-haspopup="dialog"
          aria-keyshortcuts="?"
          onClick={() => setShortcutHelpOpen(true)}
        >
          Keyboard shortcuts <kbd className="ml-1 font-mono">?</kbd>
        </Button>
      </div>
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
      <QueueShortcutHelp
        open={shortcutHelpOpen}
        decisionsEnabled={decisionsEnabled}
        onClose={() => setShortcutHelpOpen(false)}
      />
      <Dialog
        open={activeConfirmation !== null}
        onClose={() => setConfirmation(null)}
        title={
          activeConfirmation?.decision === "approve"
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
              variant={activeConfirmation?.decision === "reject" ? "danger" : "primary"}
              onClick={() => void submitBulkDecision()}
              loading={bulkDecision.isPending}
              disabled={!activeConfirmation || bulkDecision.isPending}
            >
              Confirm{" "}
              {activeConfirmation?.decision === "approve" ? "approval" : "rejection"}
              {activeConfirmation
                ? ` of ${activeConfirmation.actions.length} actions`
                : ""}
            </Button>
          </>
        }
      >
        {activeConfirmation ? (
          <div className="space-y-3">
            <p className="text-sm text-fg">
              You are about to{" "}
              {activeConfirmation.decision === "approve" ? "approve" : "reject"}{" "}
              {activeConfirmation.actions.length} selected{" "}
              {activeConfirmation.actions.length === 1 ? "action" : "actions"}:
            </p>
            <ul className="max-h-56 space-y-2 overflow-auto text-sm text-fg">
              {activeConfirmation.actions.map((action) => (
                <li key={action.id}>
                  <span className="font-medium">{action.title}</span>
                  <span className="block text-meta text-fg-muted">
                    {action.targetRecord.label} · version {action.recordVersion}
                  </span>
                </li>
              ))}
            </ul>
            {activeConfirmation.decision === "approve" ? (
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
