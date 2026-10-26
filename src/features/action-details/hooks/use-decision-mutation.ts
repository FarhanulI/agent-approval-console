"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { approvalKeys } from "@/features/approvals/hooks/use-actions-query";
import { actionsService } from "@/features/approvals/services";
import { ActionsServiceError } from "@/features/approvals/services/actions-service-error";
import type { ActionsService, DecideActionInput } from "@/features/approvals/types";

/**
 * Submits a single approve/reject decision and reconciles TanStack Query
 * caches against the authoritative server state.
 *
 * Cache policy (the cache is never written optimistically):
 * - confirmed success: invalidate the detail entry and every list entry, so
 *   both refetch and show the server's status/version;
 * - `conflict`, `unknown-outcome`, `not-found`: invalidate the detail entry
 *   (and lists) so the action is re-read; for an unknown outcome this refetch
 *   is the reconciliation step, not a retry of the decision;
 * - other errors (validation, authorization, unavailable): nothing is
 *   invalidated because no state change is implied.
 *
 * Mutation retries are disabled app-wide (`Providers`) and here explicitly: a
 * decision is never resubmitted automatically. The hook keeps one
 * `Idempotency-Key` per logical decision while an outcome is unknown, but
 * duplicate-effect protection depends on backend support, which is not
 * verified for `erp-mcp-bridge`.
 */
export function useDecisionMutation(service: ActionsService = actionsService) {
  const queryClient = useQueryClient();
  // One key per logical decision (action + decision + version + reason). It is
  // reused while the outcome is unknown so a resubmission is recognisable to
  // the backend, and dropped once the outcome is definite. A key does not by
  // itself prevent duplicates; that depends on backend support (unverified).
  const keys = useRef(new Map<string, string>());
  const logicalKey = (input: DecideActionInput) =>
    JSON.stringify([input.actionId, input.decision, input.recordVersion, input.reason ?? ""]);

  const reconcile = (actionId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: approvalKeys.detail(actionId) }),
      queryClient.invalidateQueries({ queryKey: approvalKeys.lists() }),
    ]);

  return useMutation({
    mutationFn: (input: DecideActionInput) => {
      const id = logicalKey(input);
      let key = keys.current.get(id);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(id, key);
      }
      return service.decideAction({ ...input, idempotencyKey: key });
    },
    retry: false,
    onSuccess: (_result, input) => {
      keys.current.delete(logicalKey(input));
      return reconcile(input.actionId);
    },
    onError: (error, input) => {
      if (!(error instanceof ActionsServiceError && error.kind === "unknown-outcome")) {
        keys.current.delete(logicalKey(input));
      }
      if (
        error instanceof ActionsServiceError &&
        (error.kind === "conflict" ||
          error.kind === "unknown-outcome" ||
          error.kind === "not-found")
      ) {
        return reconcile(input.actionId);
      }
    },
  });
}
