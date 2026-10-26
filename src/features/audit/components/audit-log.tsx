"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ActionsServiceError } from "@/features/approvals/services/actions-service-error";
import { useAuditEventsQuery } from "../hooks/use-audit-queries";
import { useAuditUrlState } from "../hooks/use-audit-url-state";
import type { AuditService } from "../types";
import {
  clearAuditFilters,
  hasActiveAuditFilters,
  lastAuditPage,
  toAuditQuery,
} from "../utils/audit-state";
import { AuditEventDialog } from "./audit-event-dialog";
import { AuditTable } from "./audit-table";
import { AuditToolbar } from "./audit-toolbar";

export type AuditLogProps = {
  /** Injection point for tests; defaults to the app's configured service. */
  service?: AuditService;
};

export function AuditLog({ service }: AuditLogProps) {
  const { state, update } = useAuditUrlState();
  const query = useMemo(() => toAuditQuery(state), [state]);
  const result = useAuditEventsQuery(query, service);
  const { data, isPlaceholderData: stale } = result;
  const filtersActive = hasActiveAuditFilters(state);
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  // A page past the end (e.g. after data shrank) falls back to the last page.
  const outOfRange =
    data !== undefined &&
    !stale &&
    data.items.length === 0 &&
    data.pagination.total > 0 &&
    state.page > 1;
  const fallbackPage = data ? lastAuditPage(data.pagination.total, data.pagination.pageSize) : 1;
  useEffect(() => {
    if (outOfRange) update({ page: fallbackPage });
  }, [outOfRange, fallbackPage, update]);

  const handleClear = () => update(clearAuditFilters(state));

  let content;
  if (result.isError && !data) {
    const error = result.error;
    content = (
      <ErrorState
        title="Audit events could not be loaded"
        description={
          error instanceof ActionsServiceError
            ? error.code === "audit_unavailable"
              ? "Audit history is not available in this environment."
              : error.message
            : "An unexpected error occurred while loading audit events."
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
    content = <LoadingState label="Loading audit events" />;
  } else if (data.items.length === 0) {
    content = filtersActive ? (
      <EmptyState
        title="No events match the current criteria"
        description="Try a different search term or date range, or clear the filters."
        action={<Button onClick={handleClear}>Clear filters</Button>}
      />
    ) : (
      <EmptyState
        title="No audit events yet"
        description="Events appear here after decisions are made on agent actions."
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
            <span>The latest refresh failed. You are viewing the last data that loaded.</span>
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
        <AuditTable
          events={data.items}
          direction={state.direction}
          onDirectionChange={(direction) => update({ direction })}
          page={data.pagination.page}
          pageSize={data.pagination.pageSize}
          total={data.pagination.total}
          onPageChange={(page) => update({ page })}
          onOpenEvent={setOpenEventId}
          stale={stale}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AuditToolbar state={state} onChange={update} onClear={handleClear} />
      <p role="status" className="min-h-5 text-meta text-fg-muted">
        {data && (result.isFetching || stale) ? "Updating results…" : ""}
      </p>
      {content}
      <AuditEventDialog eventId={openEventId} onClose={() => setOpenEventId(null)} service={service} />
    </div>
  );
}
