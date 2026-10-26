"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  AUDIT_EVENT_TYPES,
  AUDIT_OUTCOMES,
  auditEventTypeSchema,
  auditOutcomeSchema,
} from "../schemas/audit-event";
import { hasActiveAuditFilters, type AuditState } from "../utils/audit-state";
import { eventTypeLabels, outcomeLabels } from "../utils/presentation";

export const AUDIT_SEARCH_DEBOUNCE_MS = 300;

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
  const outcomeId = useId();
  const fromId = useId();
  const toId = useId();
  const active = hasActiveAuditFilters(state);

  return (
    <form
      role="search"
      aria-label="Filter audit events"
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => event.preventDefault()}
    >
      <SearchBox value={state.search} onCommit={(search) => onChange({ search: search.trim() })} />
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
      <Button variant="secondary" onClick={onClear} disabled={!active}>
        Clear filters
      </Button>
    </form>
  );
}
