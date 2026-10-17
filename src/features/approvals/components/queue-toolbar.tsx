"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { approvalStatusSchema, riskLevelSchema } from "../contracts";
import type { QueueState } from "../types";
import {
  riskLabels,
  riskOptions,
  statusLabels,
  statusOptions,
} from "../utils/presentation";
import { hasActiveFilters } from "../utils/queue-state";

export const SEARCH_DEBOUNCE_MS = 300;

type SearchBoxProps = {
  value: string;
  onCommit: (value: string) => void;
  debounceMs?: number;
};

/**
 * Keeps a local draft so typing is instant, and commits to the URL after the
 * user pauses. External changes (clear filters, back/forward) replace the
 * draft; our own commits echoing back through the URL do not.
 */
function SearchBox({
  value,
  onCommit,
  debounceMs = SEARCH_DEBOUNCE_MS,
}: SearchBoxProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [committed, setCommitted] = useState(value);
  const [seenValue, setSeenValue] = useState(value);

  if (value !== seenValue) {
    setSeenValue(value);
    if (value !== committed) {
      setDraft(value);
      setCommitted(value);
    }
  }

  useEffect(() => {
    if (draft.trim() === committed.trim()) return;
    const timer = setTimeout(() => {
      setCommitted(draft);
      onCommit(draft);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [draft, committed, debounceMs, onCommit]);

  return (
    <div className="min-w-56 flex-1 space-y-1">
      <label htmlFor={id} className="text-meta font-medium text-fg-muted">
        Search actions
      </label>
      <Input
        id={id}
        type="search"
        value={draft}
        maxLength={200}
        placeholder="Title, summary, target, agent or ID"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            setCommitted(draft);
            onCommit(draft);
          }
        }}
      />
    </div>
  );
}

export type QueueToolbarProps = {
  state: QueueState;
  onChange: (patch: Partial<QueueState>) => void;
  onClear: () => void;
};

export function QueueToolbar({ state, onChange, onClear }: QueueToolbarProps) {
  const statusId = useId();
  const riskId = useId();
  const active = hasActiveFilters(state);

  return (
    <div className="space-y-3">
      <form
        role="search"
        aria-label="Filter pending actions"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => event.preventDefault()}
      >
        <SearchBox
          value={state.search}
          onCommit={(search) => onChange({ search: search.trim() })}
        />
        <div className="w-full space-y-1 sm:w-44">
          <label htmlFor={statusId} className="text-meta font-medium text-fg-muted">
            Status
          </label>
          <Select
            id={statusId}
            value={state.status ?? ""}
            onChange={(event) => {
              const parsed = approvalStatusSchema.safeParse(event.target.value);
              onChange({ status: parsed.success ? parsed.data : undefined });
            }}
          >
            <option value="">All statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full space-y-1 sm:w-40">
          <label htmlFor={riskId} className="text-meta font-medium text-fg-muted">
            Risk
          </label>
          <Select
            id={riskId}
            value={state.risk ?? ""}
            onChange={(event) => {
              const parsed = riskLevelSchema.safeParse(event.target.value);
              onChange({ risk: parsed.success ? parsed.data : undefined });
            }}
          >
            <option value="">All risk levels</option>
            {riskOptions.map((risk) => (
              <option key={risk} value={risk}>
                {riskLabels[risk]}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" onClick={onClear} disabled={!active}>
          Clear filters
        </Button>
      </form>
      {active ? (
        <ul
          aria-label="Active filters"
          className="flex flex-wrap items-center gap-2 text-meta text-fg-muted"
        >
          {state.search.trim() ? (
            <li className="rounded-md bg-surface-muted px-2 py-1">
              Search: “{state.search.trim()}”
            </li>
          ) : null}
          {state.status ? (
            <li className="rounded-md bg-surface-muted px-2 py-1">
              Status: {statusLabels[state.status]}
            </li>
          ) : null}
          {state.risk ? (
            <li className="rounded-md bg-surface-muted px-2 py-1">
              Risk: {riskLabels[state.risk]}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
