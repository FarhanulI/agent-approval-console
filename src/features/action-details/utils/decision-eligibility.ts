import type { ApprovalStatus } from "@/features/approvals/contracts";
import { statusLabels } from "@/features/approvals/utils/presentation";

export type DecisionEligibility =
  | { canDecide: true }
  | {
      canDecide: false;
      reason: "decisions-unavailable" | "status-not-pending" | "role-read-only";
      message: string;
    };

/**
 * Frontend usability hint for whether to offer Approve/Reject.
 *
 * This is NOT authorization and NOT a guarantee: the contract has no
 * eligibility or permission field, so the only signals are `status === "pending"`
 * (the first step of the documented lifecycle) and the signed-in role hint.
 * The server BFF and backend must re-check status, policy, tenant, permissions
 * and `recordVersion` when a decision is made.
 *
 * @param decisionsEnabled `ActionsService.decisionsEnabled`; false wins over status.
 * @param roleMayDecide UI hint from the session role; defaults to true.
 */
export function getDecisionEligibility(
  status: ApprovalStatus,
  decisionsEnabled: boolean,
  roleMayDecide = true,
): DecisionEligibility {
  if (!decisionsEnabled) {
    return {
      canDecide: false,
      reason: "decisions-unavailable",
      message:
        "Decisions are unavailable in this environment: no verified backend is configured. This view is read-only.",
    };
  }
  if (!roleMayDecide) {
    return {
      canDecide: false,
      reason: "role-read-only",
      message: "Your role is read-only. You can review this action but not decide it.",
    };
  }
  if (status !== "pending") {
    return {
      canDecide: false,
      reason: "status-not-pending",
      message: `Only pending actions can receive a decision. This action is ${statusLabels[status].toLowerCase()}.`,
    };
  }
  return { canDecide: true };
}

/** Short lifecycle note; keeps approval and execution visibly separate. */
export function describeStatus(status: ApprovalStatus): string | undefined {
  switch (status) {
    case "approved":
      return "A decision to approve was recorded. Approval is not execution; execution has not been confirmed here.";
    case "executing":
      return "Execution is reported as in progress. It has not completed.";
    case "executed":
      return "The backend reports this action as executed.";
    case "failed":
      return "The backend reports that execution failed.";
    case "conflict":
      return "The backend reports a conflict for this action.";
    default:
      return undefined;
  }
}
