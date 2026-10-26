"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import type { DecisionResult, PendingAction } from "@/features/approvals/contracts";
import { ActionsServiceError } from "@/features/approvals/services/actions-service-error";
import { useCanOffer } from "@/features/authentication/components/principal-context";
import type { ActionsService } from "@/features/approvals/types";
import { statusLabels } from "@/features/approvals/utils/presentation";
import { useDecisionMutation } from "../hooks/use-decision-mutation";
import { getDecisionEligibility } from "../utils/decision-eligibility";

type Decision = "approve" | "reject";

const MAX_REASON_LENGTH = 2000;

export type DecisionPanelProps = {
  action: PendingAction;
  service: ActionsService;
  /** A detail refetch is running: the displayed version may be outdated. */
  isRefreshing: boolean;
  /** The last refetch failed: the displayed data is known to be possibly stale. */
  refreshFailed: boolean;
};

/** Maps a decision error to user-facing text without asserting more than is known. */
function describeError(error: ActionsServiceError): string {
  switch (error.kind) {
    case "conflict":
      return error.code === "invalid_transition"
        ? "The server rejected this decision: the action is no longer in a state that accepts it. The details below have been refreshed. Review them before deciding again."
        : "The server rejected this decision because the action changed after you loaded it. The details below have been refreshed. Review them before deciding again.";
    case "not-found":
      return "The server could not find this action.";
    case "unknown-outcome":
      return "The outcome of this decision could not be confirmed. It may or may not have been recorded. Do not resubmit; the current state is being re-read.";
    case "unavailable":
      return error.message;
    default:
      if (error.status === 401 || error.status === 403) {
        return "You are not authorized to record this decision.";
      }
      return `The decision was not recorded: ${error.message}`;
  }
}

/**
 * Approve/Reject controls for a single action.
 *
 * Behaviour:
 * - Controls are enabled only when `getDecisionEligibility` allows it (a
 *   frontend hint; the backend must re-check status, permissions and version),
 *   no request is in flight, the detail data is neither refreshing nor stale,
 *   and the outcome of an earlier attempt is not ambiguous.
 * - A modal confirmation shows the exact `recordVersion` that will be
 *   submitted (always the version currently displayed). `inFlightRef`
 *   prevents a second submit before React re-renders; this is UI-level
 *   protection only, not backend idempotency.
 * - The optional reason lives in panel state, so it survives conflicts and
 *   errors and is cleared only after a confirmed success.
 * - Unknown outcome: the hook re-reads the action. Resubmission stays blocked
 *   while the action still shows the same version as when the unknown outcome
 *   occurred (a single successful read does not prove nothing was committed).
 *   It unblocks only if the authoritative version changes.
 * - A confirmed approve is reported as "approved", never as executed.
 *
 * Accessibility: status/error messages use `role="status"`/`role="alert"`;
 * the confirmation is a native modal `<dialog>` (focus trap, Escape to cancel).
 */
export function DecisionPanel({
  action,
  service,
  isRefreshing,
  refreshFailed,
}: DecisionPanelProps) {
  const mutation = useDecisionMutation(service);
  // UI hint only; the BFF enforces the role. Hides controls for read-only users.
  const mayApprove = useCanOffer("action:approve");
  const mayReject = useCanOffer("action:reject");
  const roleMayDecide = mayApprove && mayReject;
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState<Decision | null>(null);
  const [outcome, setOutcome] = useState<DecisionResult | null>(null);
  const [unknownVersion, setUnknownVersion] = useState<number | null>(null);
  const inFlightRef = useRef(false);

  const eligibility = getDecisionEligibility(
    action.status,
    service.decisionsEnabled,
    roleMayDecide,
  );
  const busy = mutation.isPending;
  const blockedByUnknown =
    unknownVersion !== null && action.recordVersion === unknownVersion;
  const controlsDisabled =
    !eligibility.canDecide || busy || isRefreshing || refreshFailed || blockedByUnknown;
  const error = mutation.error instanceof ActionsServiceError ? mutation.error : null;
  const reconciledAfterUnknown = unknownVersion !== null && !blockedByUnknown;

  function submit() {
    if (!confirming || inFlightRef.current || controlsDisabled) return;
    inFlightRef.current = true;
    const decision = confirming;
    const submittedVersion = action.recordVersion;
    mutation.mutate(
      {
        actionId: action.id,
        decision,
        reason: reason.trim() || undefined,
        recordVersion: submittedVersion,
      },
      {
        onSuccess: (result) => {
          setOutcome(result);
          setUnknownVersion(null);
          setReason("");
        },
        onError: (failure) => {
          setOutcome(null);
          if (failure instanceof ActionsServiceError && failure.kind === "unknown-outcome") {
            setUnknownVersion(submittedVersion);
          }
        },
        onSettled: () => {
          inFlightRef.current = false;
          setConfirming(null);
        },
      },
    );
  }

  return (
    <Card aria-labelledby="decision-title" role="region">
      <CardHeader>
        <CardTitle id="decision-title">Decision</CardTitle>
        <CardDescription>
          Approving records your decision only. It does not execute the change.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!eligibility.canDecide ? (
          <p className="text-sm text-fg-muted" data-testid="decision-unavailable">
            {eligibility.message}
          </p>
        ) : (
          <>
            <div>
              <label htmlFor="decision-reason" className="text-sm font-medium text-fg">
                Reason (optional)
              </label>
              <textarea
                id="decision-reason"
                className="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-fg"
                rows={3}
                maxLength={MAX_REASON_LENGTH}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button disabled={controlsDisabled} onClick={() => setConfirming("approve")}>
                Approve
              </Button>
              <Button
                variant="danger"
                disabled={controlsDisabled}
                onClick={() => setConfirming("reject")}
              >
                Reject
              </Button>
            </div>
            {isRefreshing ? (
              <p role="status" className="text-sm text-fg-muted">
                Refreshing action details. Decisions are paused until they are current.
              </p>
            ) : null}
            {refreshFailed ? (
              <p className="text-sm text-fg-muted">
                Decisions are disabled while the displayed details may be out of date.
              </p>
            ) : null}
          </>
        )}

        {outcome ? (
          <div role="status" className="rounded-md border border-line bg-surface-muted p-3 text-sm text-fg">
            <p className="font-medium">
              {outcome.decision === "approve" ? "Approval recorded" : "Rejection recorded"}
            </p>
            <p className="mt-1">{outcome.message}</p>
            <p className="mt-1 text-fg-muted">
              Reported status: {statusLabels[outcome.status]} (record version{" "}
              {outcome.recordVersion}).
              {outcome.decision === "approve"
                ? " Approval is not execution: this console has not confirmed that any change was applied."
                : ""}
            </p>
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="rounded-md border border-danger-soft bg-surface p-3 text-sm text-fg">
            {describeError(error)}
            {error.requestId ? (
              <span className="mt-1 block text-meta text-fg-subtle">
                Request ID: <code className="font-mono">{error.requestId}</code>
              </span>
            ) : null}
          </div>
        ) : null}

        {blockedByUnknown && !isRefreshing ? (
          <div role="alert" className="rounded-md border border-warning-soft bg-surface p-3 text-sm text-fg">
            The outcome of your last decision could not be confirmed, and the re-read
            action still shows the same status and version. Resubmission is disabled
            because the decision may already have been recorded. Check the audit
            history or contact an administrator.
          </div>
        ) : null}

        {reconciledAfterUnknown ? (
          <p role="status" className="text-sm text-fg-muted">
            After the unconfirmed decision, the server now reports status{" "}
            {statusLabels[action.status]} at record version {action.recordVersion}.
            Review the details above.
          </p>
        ) : null}
      </CardContent>

      <Dialog
        open={confirming !== null}
        onClose={() => {
          if (!busy) setConfirming(null);
        }}
        closeOnBackdrop={!busy}
        title={confirming === "reject" ? "Reject this action?" : "Approve this action?"}
        description={
          confirming === "reject"
            ? "Rejecting records your decision that this proposal must not proceed."
            : "Approving records your decision. It does not execute the change."
        }
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant={confirming === "reject" ? "danger" : "primary"}
              loading={busy}
              disabled={controlsDisabled}
              onClick={submit}
            >
              {confirming === "reject" ? "Confirm rejection" : "Confirm approval"}
            </Button>
          </>
        }
      >
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-meta text-fg-subtle">Action</dt>
            <dd className="wrap-break-word text-fg">{action.title}</dd>
          </div>
          <div>
            <dt className="text-meta text-fg-subtle">Record version submitted</dt>
            <dd className="text-fg">{action.recordVersion}</dd>
          </div>
          <div>
            <dt className="text-meta text-fg-subtle">Reason</dt>
            <dd className="whitespace-pre-wrap wrap-break-word text-fg">
              {reason.trim() || "None provided"}
            </dd>
          </div>
        </dl>
      </Dialog>
    </Card>
  );
}
