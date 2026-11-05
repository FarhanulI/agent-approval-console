"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { ActionsServiceError } from "@/features/approvals/services/actions-service-error";
import type { RunSummary } from "../schemas/run";
import { useRunsQuery } from "../hooks/use-runs-query";
import { runsService } from "../services";
import type { RunsService } from "../types";
import {
  formatRunTimestamp,
  runStatusLabels,
  runStatusTone,
} from "../utils/presentation";

export function RunList({ service = runsService }: { service?: RunsService }) {
  const result = useRunsQuery(service);
  const [search, setSearch] = useState("");
  const items = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (result.data?.items ?? []).filter((run) => matches(run, query));
  }, [result.data?.items, search]);

  if (result.isError && !result.data) {
    const error = result.error;
    return (
      <ErrorState
        title="Agent runs could not be loaded"
        description={
          error instanceof ActionsServiceError
            ? error.code === "runs_unavailable"
              ? "Run monitoring is unavailable because no verified backend contract is configured."
              : error.message
            : "An unexpected error occurred while loading agent runs."
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

  if (!result.data) return <LoadingState label="Loading agent runs" />;
  if (result.data.items.length === 0) {
    return (
      <EmptyState
        title="No agent runs yet"
        description="Runs will appear here when the backend reports an execution."
      />
    );
  }

  return (
    <div className="space-y-4">
      <label className="block max-w-lg text-sm font-medium text-fg">
        Search runs
        <Input
          className="mt-2"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Search by run, agent, or step"
          type="search"
        />
      </label>
      {result.isRefetchError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-soft bg-surface px-4 py-3 text-sm text-fg"
        >
          <span>The latest refresh failed. You are viewing the last run snapshot.</span>
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
      <p className="min-h-5 text-meta text-fg-muted" role="status">
        {result.isFetching ? "Refreshing run snapshots…" : ""}
      </p>
      {items.length === 0 ? (
        <EmptyState
          title="No runs match your search"
          description="Try a different run ID, agent name, or current step."
          action={
            <Button variant="secondary" onClick={() => setSearch("")}>
              Clear search
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {items.map((run) => (
            <li key={run.id}>
              <RunCard run={run} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RunCard({ run }: { run: RunSummary }) {
  return (
    <Link
      href={`/runs/${encodeURIComponent(run.id)}`}
      className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Card className="transition-colors hover:bg-surface-muted">
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-fg">{run.agent.name}</h2>
              <Badge tone={runStatusTone(run.status)}>{runStatusLabels[run.status]}</Badge>
            </div>
            <p className="text-sm text-fg">{run.summary}</p>
            <p className="text-meta text-fg-muted">
              Run <code className="font-mono">{run.id}</code>
              {run.currentStep ? ` · ${run.currentStep}` : ""}
            </p>
          </div>
          <time
            className="shrink-0 text-meta text-fg-muted"
            dateTime={run.startedAt}
          >
            Started {formatRunTimestamp(run.startedAt)}
          </time>
        </CardContent>
      </Card>
    </Link>
  );
}

function matches(run: RunSummary, query: string): boolean {
  if (!query) return true;
  return [
    run.id,
    run.agent.name,
    run.agent.id,
    run.summary,
    run.currentStep ?? "",
    runStatusLabels[run.status],
  ].some((value) => value.toLowerCase().includes(query));
}
