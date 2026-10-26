"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { ActionsServiceError } from "@/features/approvals/services/actions-service-error";
import { formatDateTime } from "@/lib/utils/format-date";
import { useAuditEventQuery } from "../hooks/use-audit-queries";
import type { AuditService } from "../types";
import { eventTypeLabels, isLinkableActionId, outcomeLabels } from "../utils/presentation";
import { EventTypeBadge, OutcomeBadge } from "./audit-badges";
import Link from "next/link";

export type AuditEventDialogProps = {
  eventId: string | null;
  onClose: () => void;
  service?: AuditService;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 py-2 text-sm">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  );
}

/**
 * Detail dialog. It reads the event through the detail endpoint (so tenant
 * authorization applies again) and renders the allow-listed fields as labelled
 * text; no raw JSON dump. An unknown outcome is stated explicitly.
 */
export function AuditEventDialog({ eventId, onClose, service }: AuditEventDialogProps) {
  const query = useAuditEventQuery(eventId, service);
  const event = query.data;

  let body;
  if (query.isError) {
    const error = query.error;
    body = (
      <div role="alert" className="space-y-3 text-sm">
        <p>
          {error instanceof ActionsServiceError && error.kind === "not-found"
            ? "This event could not be found or is not available to you."
            : "The event could not be loaded."}
        </p>
        {error instanceof ActionsServiceError && error.requestId ? (
          <p className="text-fg-muted">
            Request ID: <code className="font-mono">{error.requestId}</code>
          </p>
        ) : null}
        <Button size="sm" variant="secondary" onClick={() => void query.refetch()} loading={query.isFetching}>
          Retry
        </Button>
      </div>
    );
  } else if (!event) {
    body = <LoadingState label="Loading event" />;
  } else {
    body = (
      <dl className="divide-y divide-line">
        <Row label="Event">
          <span className="inline-flex flex-wrap items-center gap-2">
            <EventTypeBadge eventType={event.eventType} />
            <OutcomeBadge outcome={event.outcome} />
          </span>
        </Row>
        <Row label="Summary">{event.summary}</Row>
        {event.outcome === "unknown" ? (
          <Row label="Note">
            The outcome was not confirmed. The decision may or may not have been recorded; check
            the action&apos;s current state.
          </Row>
        ) : null}
        <Row label="Time">
          <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt, "UTC")} UTC</time>
        </Row>
        <Row label="Actor">
          {event.actorType}
          {event.actorId ? <> · <code className="font-mono">{event.actorId}</code></> : null}
        </Row>
        <Row label="Action">
          {event.actionId ? (
            isLinkableActionId(event.actionId) ? (
              <Link
                href={`/approvals/${encodeURIComponent(event.actionId)}`}
                className="font-mono text-accent underline-offset-2 hover:underline"
              >
                {event.actionId}
              </Link>
            ) : (
              <code className="font-mono">{event.actionId}</code>
            )
          ) : (
            "—"
          )}
        </Row>
        <Row label="Request ID">
          {event.requestId ? <code className="font-mono">{event.requestId}</code> : "Not available"}
        </Row>
        <Row label="Event ID">
          <code className="font-mono">{event.id}</code>
        </Row>
        {event.details?.decision ? <Row label="Decision">{event.details.decision}</Row> : null}
        {event.details?.recordVersion !== undefined ? (
          <Row label="Record version">{event.details.recordVersion}</Row>
        ) : null}
        {event.details?.reasonProvided !== undefined ? (
          <Row label="Reason given">{event.details.reasonProvided ? "Yes (not shown)" : "No"}</Row>
        ) : null}
        {event.details?.resultingStatus ? (
          <Row label="Resulting status">{event.details.resultingStatus}</Row>
        ) : null}
        {event.details?.conflictCode ? <Row label="Conflict">{event.details.conflictCode}</Row> : null}
      </dl>
    );
  }

  return (
    <Dialog
      open={eventId !== null}
      onClose={onClose}
      title={event ? eventTypeLabels[event.eventType] : "Audit event"}
      description={
        event
          ? `Outcome: ${outcomeLabels[event.outcome]}.`
          : "Event details"
      }
    >
      {body}
    </Dialog>
  );
}
