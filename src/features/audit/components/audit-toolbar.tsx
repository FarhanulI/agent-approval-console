"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  AUDIT_ACTOR_TYPES,
  AUDIT_EVENT_TYPES,
  AUDIT_OUTCOMES,
  auditActorTypeSchema,
  auditEventTypeSchema,
  auditOutcomeSchema,
  type AuditActorType,
} from "../schemas/audit-event";
import { hasActiveAuditFilters, type AuditState } from "../utils/audit-state";
import { eventTypeLabels, outcomeLabels } from "../utils/presentation";

export const AUDIT_SEARCH_DEBOUNCE_MS = 300;

const actorTypeLabels: Record<AuditActorType, string> = {
  user: "User",
  system: "System",
  agent: "Agent",
};

function IdFilter({
  id,
  label,
  value,
  onChange,
  maxLength = 128,
}: {
  id: string;
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [committed, setCommitted] = useState(value ?? "");
  const [seenValue, setSeenValue] = useState(value ?? "");

  if ((value ?? "") !== seenValue) {
    const nextValue = value ?? "";
    setSeenValue(nextValue);
    if (nextValue !== committed) {
      setDraft(nextValue);
      setCommitted(nextValue);
    }
  }

  useEffect(() => {
    if (draft.trim() === committed.trim()) return;
    const timer = setTimeout(() => {
      const nextValue = draft.trim();
      setCommitted(nextValue);
      onChange(nextValue || undefined);
    }, AUDIT_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, committed, onChange]);

  return (
    <div className="w-full space-y-1 sm:w-40">
      <label htmlFor={id} className="text-meta font-medium text-fg-muted">
        {label}
      </label>
      <Input
        id={id}
        type="search"
        value={draft}
        maxLength={maxLength}
        placeholder={`${label} (optional)`}
        onChange={(event) => setDraft(event.target.value)}
      />
    </div>
  );
}

function SearchBox({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [committed, setCommitted] = useState(value);
  const [seenValue, setSeenValue] = useState(value);

  // External changes (clear filters, back/forward) replace the draft; our own
  // commits echoing back through the URL do not.
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
    }, AUDIT_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, committed, onCommit]);

  return (
    <div className="min-w-56 flex-1 space-y-1">
      <label htmlFor={id} className="text-meta font-medium text-fg-muted">
        Search events
      </label>
      <Input
        id={id}
        type="search"
        value={draft}
        maxLength={200}
        placeholder="Summary or action ID"
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

export type AuditToolbarProps = {
  state: AuditState;
  onChange: (patch: Partial<AuditState>) => void;
  onClear: () => void;
};

export function AuditToolbar({ state, onChange, onClear }: AuditToolbarProps) {
  const typeId = useId();
  const actorTypeId = useId();
  const actorIdId = useId();
  const userIdId = useId();
  const systemIdId = useId();
  const agentIdId = useId();
  const runIdId = useId();
  const outcomeId = useId();
  const fromId = useId();
  const toId = useId();
  const active = hasActiveAuditFilters(state);

  return (
    <div className="space-y-3">
      <form
        role="search"
        aria-label="Filter audit events"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => event.preventDefault()}
      >
        <SearchBox value={state.search} onCommit={(search) => onChange({ search: search.trim() })} />
        <div className="w-full space-y-1 sm:w-40">
          <label htmlFor={actorTypeId} className="text-meta font-medium text-fg-muted">
            Actor type
          </label>
          <Select
            id={actorTypeId}
            value={state.actorType ?? ""}
            onChange={(event) => {
              const parsed = auditActorTypeSchema.safeParse(event.target.value);
              onChange({ actorType: parsed.success ? parsed.data : undefined });
            }}
          >
            <option value="">All actor types</option>
            {AUDIT_ACTOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {actorTypeLabels[type]}
              </option>
            ))}
          </Select>
        </div>
        <IdFilter
          id={actorIdId}
          label="Actor ID"
          value={state.actorId}
          onChange={(actorId) => onChange({ actorId })}
        />
        <IdFilter
          id={userIdId}
          label="User ID"
          value={state.userId}
          onChange={(userId) => onChange({ userId })}
        />
        <IdFilter
          id={systemIdId}
          label="System ID"
          value={state.systemId}
          onChange={(systemId) => onChange({ systemId })}
        />
        <IdFilter
          id={agentIdId}
          label="Agent ID"
          value={state.agentId}
          onChange={(agentId) => onChange({ agentId })}
        />
        <IdFilter
          id={runIdId}
          label="Run ID"
          value={state.runId}
          onChange={(runId) => onChange({ runId })}
          maxLength={64}
        />
        <div className="w-full space-y-1 sm:w-48">
          <label htmlFor={typeId} className="text-meta font-medium text-fg-muted">
            Event type
          </label>
          <Select
            id={typeId}
            value={state.eventType ?? ""}
            onChange={(event) => {
              const parsed = auditEventTypeSchema.safeParse(event.target.value);
              onChange({ eventType: parsed.success ? parsed.data : undefined });
            }}
          >
            <option value="">All event types</option>
            {AUDIT_EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {eventTypeLabels[type]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full space-y-1 sm:w-40">
          <label htmlFor={outcomeId} className="text-meta font-medium text-fg-muted">
            Outcome
          </label>
          <Select
            id={outcomeId}
            value={state.outcome ?? ""}
            onChange={(event) => {
              const parsed = auditOutcomeSchema.safeParse(event.target.value);
              onChange({ outcome: parsed.success ? parsed.data : undefined });
            }}
          >
            <option value="">All outcomes</option>
            {AUDIT_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>
                {outcomeLabels[outcome]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full space-y-1 sm:w-40">
          <label htmlFor={fromId} className="text-meta font-medium text-fg-muted">
            From (UTC date)
          </label>
          <Input
            id={fromId}
            type="date"
            value={state.from ?? ""}
            max={state.to}
            onChange={(event) => onChange({ from: event.target.value || undefined })}
          />
        </div>
        <div className="w-full space-y-1 sm:w-40">
          <label htmlFor={toId} className="text-meta font-medium text-fg-muted">
            To (UTC date)
          </label>
          <Input
            id={toId}
            type="date"
            value={state.to ?? ""}
            min={state.from}
            onChange={(event) => onChange({ to: event.target.value || undefined })}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange({ from: undefined, to: undefined })}
          disabled={!state.from && !state.to}
        >
          Clear date range
        </Button>
        <Button type="button" variant="secondary" onClick={onClear} disabled={!active}>
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
          {state.actorType ? (
            <li className="rounded-md bg-surface-muted px-2 py-1">
              Actor type: {actorTypeLabels[state.actorType]}
            </li>
          ) : null}
          {state.actorId ? <li className="rounded-md bg-surface-muted px-2 py-1">Actor ID: {state.actorId}</li> : null}
          {state.userId ? <li className="rounded-md bg-surface-muted px-2 py-1">User ID: {state.userId}</li> : null}
          {state.systemId ? <li className="rounded-md bg-surface-muted px-2 py-1">System ID: {state.systemId}</li> : null}
          {state.agentId ? <li className="rounded-md bg-surface-muted px-2 py-1">Agent ID: {state.agentId}</li> : null}
          {state.runId ? <li className="rounded-md bg-surface-muted px-2 py-1">Run ID: {state.runId}</li> : null}
          {state.eventType ? (
            <li className="rounded-md bg-surface-muted px-2 py-1">
              Event type: {eventTypeLabels[state.eventType]}
            </li>
          ) : null}
          {state.outcome ? (
            <li className="rounded-md bg-surface-muted px-2 py-1">
              Outcome: {outcomeLabels[state.outcome]}
            </li>
          ) : null}
          {state.from ? <li className="rounded-md bg-surface-muted px-2 py-1">From: {state.from} UTC</li> : null}
          {state.to ? <li className="rounded-md bg-surface-muted px-2 py-1">To: {state.to} UTC</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
