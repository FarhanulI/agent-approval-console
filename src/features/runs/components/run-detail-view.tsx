"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
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
}: {
  runId: string;
  service?: RunsService;
}) {
  const result = useRunQuery(runId, service);
  const run = result.data;
  const streamStatus = useRunEvents(run, service);

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
      <ConnectionNotice status={streamStatus} onRefresh={() => void result.refetch()} />
      {run.status === "waiting" ? <ApprovalNotice run={run} /> : null}
      <RunTimeline run={run} />
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
          <OverviewField label="Related actions" value={String(run.actionIds.length)} />
        </dl>
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
}: {
  status: ReturnType<typeof useRunEvents>;
  onRefresh: () => void;
}) {
  const message: Record<typeof status, string> = {
    connected: "Live updates connected.",
    reconnecting: "Connection interrupted. Reconnecting and reconciling the run snapshot…",
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
  last,
}: {
  event: RunEvent;
  step?: RunStep;
  last: boolean;
}) {
  const actionId = event.payload?.actionId ?? step?.actionId;
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
