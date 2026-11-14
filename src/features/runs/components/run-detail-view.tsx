"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { auditService } from "@/features/audit/services";
import { useAuditEventsQuery } from "@/features/audit/hooks/use-audit-queries";
import type { AuditService } from "@/features/audit/types";
import { AUDIT_PAGE_SIZE } from "@/features/audit/utils/audit-state";
import { formatDateTime } from "@/lib/utils/format-date";
import { ActionsServiceError } from "@/features/approvals/services/actions-service-error";
import { useRunEvents } from "../hooks/use-run-events";
import { useRunQuery } from "../hooks/use-runs-query";
import type { RunDetail, RunEvent, RunEventType, RunStep } from "../schemas/run";
import type { RunsService } from "../types";
import { runsService } from "../services";
import {
  formatDuration,
  formatRunTimestamp,
  runStatusLabels,
  runStatusTone,
} from "../utils/presentation";

const eventTitles: Record<RunEventType, string> = {
  "run.started": "Run started",
  "step.started": "Step started",
  "step.completed": "Step completed",
  "step.failed": "Step failed",
  "approval.required": "Approval required",
  "approval.resolved": "Approval resolved",
  "run.completed": "Run completed",
  "run.failed": "Run failed",
  "run.cancelled": "Run cancelled",
};

const linkableActionId = /^[A-Za-z0-9_-]{1,64}$/;

export function RunDetailView({
  runId,
  service = runsService,
  auditEventsService = auditService,
}: {
  runId: string;
  service?: RunsService;
  auditEventsService?: AuditService;
}) {
  const result = useRunQuery(runId, service);
  const run = result.data;
  const stream = useRunEvents(run, service);

  if (result.isError && !run) {
    const error = result.error;
    if (error instanceof ActionsServiceError && error.kind === "not-found") {
      return (
        <EmptyState
          title="Run not found"
          description="This run does not exist or is not available to your account."
          action={
            <Link
              href="/runs"
              className="inline-flex min-h-10 items-center rounded-md border border-line-strong px-4 text-sm font-medium text-fg hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Back to live runs
            </Link>
          }
        />
      );
    }
    return (
      <ErrorState
        title="Run details could not be loaded"
        description={
          error instanceof ActionsServiceError
            ? error.message
            : "An unexpected error occurred while loading this run."
        }
        requestId={error instanceof ActionsServiceError ? error.requestId : undefined}
        action={
          <Button onClick={() => void result.refetch()} loading={result.isFetching}>
            Retry
          </Button>
        }
      />
    );
  }

  if (!run) return <LoadingState label="Loading run details" />;

  return (
    <div className="space-y-5">
      {result.isRefetchError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-soft bg-surface px-4 py-3 text-sm text-fg"
        >
          <span>The latest snapshot refresh failed. The displayed run data may be stale.</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void result.refetch()}
            loading={result.isFetching}
          >
            Refresh snapshot
          </Button>
        </div>
      ) : null}

      <RunOverview run={run} />
      <ConnectionNotice
        status={stream.status}
        onRefresh={() => void result.refetch()}
        onRetry={stream.retry}
      />
      {run.status === "waiting" ? <ApprovalNotice run={run} /> : null}
      <RunTimeline run={run} />
      <RunAuditEvents
        key={run.id}
        runId={run.id}
        active={["queued", "running", "waiting"].includes(run.status)}
        service={auditEventsService}
      />
    </div>
  );
}

function RunOverview({ run }: { run: RunDetail }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{run.agent.name}</CardTitle>
          <Badge tone={runStatusTone(run.status)}>{runStatusLabels[run.status]}</Badge>
        </div>
        <p className="break-all font-mono text-meta text-fg-muted">{run.id}</p>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-fg">{run.summary}</p>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <OverviewField label="Agent ID" value={run.agent.id} />
          {run.agent.model ? <OverviewField label="Model" value={run.agent.model} /> : null}
          <OverviewField label="Started" value={formatRunTimestamp(run.startedAt)} />
          <OverviewField
            label={run.completedAt ? "Duration" : "Elapsed"}
            value={formatDuration(run.startedAt, run.completedAt)}
          />
          <OverviewField label="Current step" value={run.currentStep ?? "No active step"} />
        </dl>
        <div className="mt-5">
          <h3 className="text-meta text-fg-muted">
            Related actions ({run.actionIds.length})
          </h3>
          {run.actionIds.length === 0 ? (
            <p className="mt-1 text-sm text-fg-muted">No related actions.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-3 text-sm">
              {run.actionIds.map((actionId) => (
                <li key={actionId}>
                  {linkableActionId.test(actionId) ? (
                    <Link
                      href={`/approvals/${encodeURIComponent(actionId)}`}
                      className="font-mono text-accent underline-offset-2 hover:underline"
                    >
                      {actionId}
                    </Link>
                  ) : (
                    <code className="font-mono text-fg-muted">{actionId}</code>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {run.resultSummary ? (
          <p className="mt-5 rounded-md border border-line bg-surface-muted px-4 py-3 text-sm text-fg">
            <strong>Final result:</strong> {run.resultSummary}
          </p>
        ) : null}
        {run.errorSummary ? (
          <p className="mt-5 rounded-md border border-danger-soft bg-surface px-4 py-3 text-sm text-fg">
            <strong>Error:</strong> {run.errorSummary}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RunAuditEvents({
  runId,
  active,
  service,
}: {
  runId: string;
  active: boolean;
  service: AuditService;
}) {
  const [page, setPage] = useState(1);
  const query = useMemo(
    () => ({
      runId,
      page,
      pageSize: AUDIT_PAGE_SIZE,
      sortBy: "occurredAt" as const,
      sortDirection: "asc" as const,
    }),
    [page, runId],
  );
  const result = useAuditEventsQuery(query, service, {
    refetchInterval: active ? 5000 : false,
  });
  const data = result.data;
  const events = useMemo(() => {
    if (!data) return [];
    const unique = new Map(data.items.map((event) => [event.id, event]));
    return [...unique.values()].sort(
      (left, right) =>
        Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
        left.id.localeCompare(right.id),
    );
  }, [data]);

  let content;
  if (result.isError && !data) {
    const error = result.error;
    content = (
      <ErrorState
        title="Related audit events could not be loaded"
        description={
          error instanceof ActionsServiceError && error.code === "audit_unavailable"
            ? "Audit history is not available in this environment."
            : "The audit backend could not return events associated with this run."
        }
        requestId={error instanceof ActionsServiceError ? error.requestId : undefined}
        action={
          <Button onClick={() => void result.refetch()} loading={result.isFetching}>
            Retry
          </Button>
        }
      />
    );
  } else if (!data) {
    content = <LoadingState label="Loading related audit events" />;
  } else if (events.length === 0) {
    content = (
      <p className="text-sm text-fg-muted">
        No related audit events are available yet.
      </p>
    );
  } else {
    const pageCount = Math.max(1, Math.ceil(data.pagination.total / data.pagination.pageSize));
    content = (
      <div className="space-y-3">
        {result.isRefetchError ? (
          <p role="alert" className="text-sm text-danger">
            The latest audit refresh failed; the displayed events may be stale.
          </p>
        ) : null}
        <ol aria-label="Run audit events" className="space-y-3">
          {events.map((event) => (
            <li key={event.id} className="border-l-2 border-line pl-3">
              <time
                dateTime={event.occurredAt}
                className="text-meta text-fg-muted"
              >
                {formatDateTime(event.occurredAt, "UTC")} UTC
              </time>
              <p className="mt-1 text-sm font-medium text-fg">{event.summary}</p>
              <p className="mt-1 text-meta text-fg-muted">
                {event.eventType} · {event.outcome}
              </p>
            </li>
          ))}
        </ol>
        {pageCount > 1 ? (
          <nav aria-label="Related audit event pagination" className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPage((current) => current - 1)}
              disabled={result.isPlaceholderData || page <= 1}
              aria-label="Previous related audit page"
            >
              Previous
            </Button>
            <p className="text-meta text-fg-muted">
              Page {data.pagination.page} of {pageCount} · {data.pagination.total} events
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPage((current) => current + 1)}
              disabled={result.isPlaceholderData || page >= pageCount}
              aria-label="Next related audit page"
            >
              Next
            </Button>
          </nav>
        ) : null}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Related audit events</CardTitle>
          <Link
            href={`/audit?runId=${encodeURIComponent(runId)}`}
            className="text-sm font-medium text-accent underline-offset-2 hover:underline"
          >
            View in audit log
          </Link>
        </div>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

function OverviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-meta text-fg-muted">{label}</dt>
      <dd className="mt-1 break-words font-medium text-fg">{value}</dd>
    </div>
  );
}

function ConnectionNotice({
  status,
  onRefresh,
  onRetry,
}: {
  status: ReturnType<typeof useRunEvents>["status"];
  onRefresh: () => void;
  onRetry: () => void;
}) {
  const message: Record<typeof status, string> = {
    connected: "Live updates connected.",
    reconnecting: "Connection interrupted. Reconnecting and reconciling the run snapshot…",
    recovering: "Recovering the run from its latest snapshot…",
    "recovery-incomplete":
      "Run recovery is incomplete. Some event history may be missing; the run snapshot is retained.",
    "history-unavailable":
      "Event history is unavailable. The latest run snapshot is shown without inventing missing events.",
    disconnected: "Live updates are disconnected. The last run snapshot is still available.",
    connecting: "Connecting to live updates…",
    inactive: "This run is not active. The displayed timeline is a run snapshot.",
  };
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-3 text-sm text-fg-muted"
    >
      <span>{message[status]}</span>
      {status === "disconnected" ||
      status === "recovery-incomplete" ||
      status === "history-unavailable" ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry recovery
        </Button>
      ) : null}
      {status === "disconnected" ? (
        <Button size="sm" variant="secondary" onClick={onRefresh}>
          Refresh snapshot
        </Button>
      ) : null}
    </div>
  );
}

function ApprovalNotice({ run }: { run: RunDetail }) {
  const actionId = run.actionIds.find((id) => linkableActionId.test(id));
  return (
    <section
      aria-labelledby="approval-required-heading"
      className="rounded-lg border border-warning-soft bg-warning-soft/40 px-5 py-4"
    >
      <h2 id="approval-required-heading" className="font-semibold text-fg">
        Human approval required
      </h2>
      <p className="mt-1 text-sm leading-6 text-fg">
        This run is paused. Approval is separate from execution; reviewing the action does not
        confirm that the business operation completed.
      </p>
      {actionId ? (
        <Link
          href={`/approvals/${encodeURIComponent(actionId)}`}
          className="mt-3 inline-flex min-h-10 items-center font-medium text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Review action {actionId}
        </Link>
      ) : (
        <p className="mt-3 text-sm text-fg-muted">
          No valid related action is available to open.
        </p>
      )}
    </section>
  );
}

function RunTimeline({ run }: { run: RunDetail }) {
  const events = [...run.events].sort((left, right) => left.sequence - right.sequence);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution timeline</CardTitle>
        <p className="text-sm text-fg-muted">
          Events are ordered by sequence number. The run snapshot remains authoritative.
        </p>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-fg-muted">No timeline events are available.</p>
        ) : (
          <ol aria-label="Run events" className="space-y-0">
            {events.map((event, index) => (
              <TimelineEvent
                key={`${event.id}:${event.sequence}`}
                event={event}
                step={event.stepId ? run.steps.find((item) => item.id === event.stepId) : undefined}
                relatedActionIds={run.actionIds}
                last={index === events.length - 1}
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineEvent({
  event,
  step,
  relatedActionIds,
  last,
}: {
  event: RunEvent;
  step?: RunStep;
  relatedActionIds: readonly string[];
  last: boolean;
}) {
  const candidateActionId = event.payload?.actionId ?? step?.actionId;
  const actionId =
    candidateActionId && relatedActionIds.includes(candidateActionId)
      ? candidateActionId
      : undefined;
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      <span
        aria-hidden="true"
        className={`relative mt-1 flex size-3 shrink-0 rounded-full ${
          last ? "bg-accent" : "bg-fg-subtle"
        }`}
      >
        {!last ? (
          <span className="absolute left-1/2 top-3 h-[calc(100%+1.5rem)] w-px -translate-x-1/2 bg-line" />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <h3 className="font-medium text-fg">{eventTitles[event.type]}</h3>
          <time className="text-meta text-fg-muted" dateTime={event.timestamp}>
            {formatRunTimestamp(event.timestamp)}
          </time>
        </div>
        <p className="mt-1 text-sm leading-6 text-fg-muted">
          {event.payload?.message ?? step?.description ?? "Run state updated."}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fg-subtle">
          <span>Sequence {event.sequence}</span>
          {step ? <span>{step.title}</span> : null}
          {step?.durationMs !== undefined ? (
            <span>Duration {formatDuration(step.startedAt ?? event.timestamp, step.completedAt)}</span>
          ) : null}
          {actionId && linkableActionId.test(actionId) ? (
            <Link
              href={`/approvals/${encodeURIComponent(actionId)}`}
              className="font-medium text-accent underline underline-offset-2"
            >
              Open action {actionId}
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}
