"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { actionsService } from "@/features/approvals/services";
import { ActionsServiceError } from "@/features/approvals/services/actions-service-error";
import type { ActionsService } from "@/features/approvals/types";
import { useActionQuery } from "../hooks/use-action-query";
import { ActionSummary, ReasoningSummary } from "./action-summary";
import { DecisionPanel } from "./decision-panel";
import { EvidenceSection } from "./evidence-section";
import { RecordDiff } from "./record-diff";

const backLink = (
  <Link
    href="/approvals"
    className="inline-flex min-h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-surface-muted"
  >
    Back to Pending Actions Queue
  </Link>
);

/**
 * Client container for `/approvals/[actionId]`: loads the action through the
 * typed service and chooses between loading, not-found, error, stale and
 * success presentations.
 *
 * Staleness: while a refetch runs, or after one failed with older data still
 * on screen, the page says so and `DecisionPanel` blocks decisions, because
 * the displayed `recordVersion` is what a decision submits. A refetch that
 * reports not-found replaces the page with the not-found state even if older
 * data exists.
 *
 * @param actionId Route parameter. Untrusted; URL-encoded by the service.
 * @param service Injected for tests; defaults to the app service.
 */
export function ActionDetail({
  actionId,
  service = actionsService,
}: {
  actionId: string;
  service?: ActionsService;
}) {
  const query = useActionQuery(actionId, service);
  const error = query.error instanceof ActionsServiceError ? query.error : null;

  if (error?.kind === "not-found") {
    return (
      <ErrorState
        title="Action not found"
        description="No action with this identifier exists, or it is no longer available."
        requestId={error.requestId}
        action={backLink}
      />
    );
  }

  if (query.isPending) {
    return <LoadingState label="Loading action" />;
  }

  if (!query.data) {
    return (
      <ErrorState
        title="Could not load the action"
        description={
          error?.message ?? "The action could not be loaded. Try again."
        }
        requestId={error?.requestId}
        action={
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void query.refetch()}>Try again</Button>
            {backLink}
          </div>
        }
      />
    );
  }

  const action = query.data;
  const refreshFailed = query.isError;

  return (
    <div className="space-y-6">
      <div>{backLink}</div>

      {refreshFailed ? (
        <div role="alert" className="rounded-md border border-warning-soft bg-surface p-3 text-sm text-fg">
          Could not refresh this action. You are viewing the last loaded data,
          which may be out of date.{" "}
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : query.isFetching ? (
        <p role="status" className="text-sm text-fg-muted">
          Refreshing action details…
        </p>
      ) : null}

      <ActionSummary action={action} />
      <ReasoningSummary summary={action.summary} />
      <EvidenceSection evidence={action.evidence} />
      <RecordDiff changes={action.changes} />
      <DecisionPanel
        action={action}
        service={service}
        isRefreshing={query.isFetching}
        refreshFailed={refreshFailed}
      />
    </div>
  );
}
