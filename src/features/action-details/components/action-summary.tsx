import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PendingAction } from "@/features/approvals/contracts";
import { RiskBadge, StatusBadge } from "@/features/approvals/components/status-badges";
import { formatDateTime } from "@/lib/utils/format-date";
import { describeStatus } from "../utils/decision-eligibility";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-meta text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 wrap-break-word text-sm text-fg">{children}</dd>
    </div>
  );
}

/**
 * Identity, status, risk, target record, agent, timestamps and record version
 * of an action. Every value comes from the validated `PendingAction`; optional
 * fields that are absent are omitted rather than shown as placeholders. All
 * values render as text nodes, so untrusted strings stay inert.
 */
export function ActionSummary({ action }: { action: PendingAction }) {
  const statusNote = describeStatus(action.status);
  return (
    <Card aria-labelledby="action-summary-title" role="region">
      <CardHeader>
        <CardTitle id="action-summary-title">{action.title}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={action.status} />
          <RiskBadge risk={action.risk} />
        </div>
        {statusNote ? <CardDescription>{statusNote}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Action ID">
            <code className="font-mono">{action.id}</code>
          </Field>
          <Field label="Target record">
            {action.targetRecord.label}{" "}
            <span className="text-fg-muted">
              ({action.targetRecord.entity}{" "}
              <code className="font-mono">{action.targetRecord.recordId}</code>)
            </span>
          </Field>
          {action.targetRecord.tenantId ? (
            <Field label="Tenant">
              <code className="font-mono">{action.targetRecord.tenantId}</code>
            </Field>
          ) : null}
          {action.agent ? (
            <Field label="Agent">
              {action.agent.name}
              {action.agent.model ? (
                <span className="text-fg-muted"> · {action.agent.model}</span>
              ) : null}
            </Field>
          ) : null}
          {action.runId ? (
            <Field label="Run">
              <code className="font-mono">{action.runId}</code>
            </Field>
          ) : null}
          <Field label="Record version">{action.recordVersion}</Field>
          <Field label="Created">{formatDateTime(action.createdAt)}</Field>
          <Field label="Last updated">{formatDateTime(action.updatedAt)}</Field>
          {action.decisionDeadline ? (
            <Field label="Decision deadline">{formatDateTime(action.decisionDeadline)}</Field>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

/**
 * The agent-supplied `summary` field, labelled as such. It is a concise,
 * user-facing explanation; the contract has no reasoning/chain-of-thought
 * field and none is shown or inferred. Kept visually separate from evidence.
 */
export function ReasoningSummary({ summary }: { summary: string }) {
  return (
    <Card aria-labelledby="reasoning-title" role="region">
      <CardHeader>
        <CardTitle id="reasoning-title">Agent summary</CardTitle>
        <CardDescription>
          Explanation supplied by the agent for this proposal. It is not a
          transcript of the agent&apos;s internal reasoning and is not source evidence.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap wrap-break-word text-sm leading-6 text-fg">{summary}</p>
      </CardContent>
    </Card>
  );
}
