"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { approvalKeys } from "@/features/approvals/hooks/use-actions-query";
import { actionsService } from "@/features/approvals/services";
import { ActionsServiceError } from "@/features/approvals/services/actions-service-error";
import { auditKeys } from "@/features/audit/hooks/use-audit-queries";
import type { ActionsService, DecideActionInput } from "@/features/approvals/types";

/**
 * Submits a single approve/reject decision and reconciles TanStack Query
 * caches against the authoritative server state.
 *
 * Cache policy (the cache is never written optimistically):
 * - confirmed success: invalidate the detail entry and every list entry, so
 *   the queue, detail, and audit history refetch from the server;
 * - `conflict`, `unknown-outcome`, `not-found`: invalidate the detail entry
 *   (and lists) so the action is re-read; also refresh audit history where a
 *   conflict or unknown outcome may have produced an audit event;
 * - other errors (validation, authentication, unavailable): nothing is
 *   invalidated, except a 403 denial may also have produced an audit event;
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

  const reconcile = (actionId: string, refreshAudit = false) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: approvalKeys.detail(actionId) }),
      queryClient.invalidateQueries({ queryKey: approvalKeys.lists() }),
      ...(refreshAudit
        ? [queryClient.invalidateQueries({ queryKey: auditKeys.lists() })]
        : []),
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
      return reconcile(input.actionId, true);
    },
    onError: (error, input) => {
      if (!(error instanceof ActionsServiceError && error.kind === "unknown-outcome")) {
        keys.current.delete(logicalKey(input));
      }
      if (
        error instanceof ActionsServiceError &&
        (error.kind === "conflict" ||
          error.kind === "unknown-outcome" ||
          error.kind === "not-found" ||
          (error.kind === "http" && error.status === 403))
      ) {
        return reconcile(
          input.actionId,
          error.kind === "conflict" ||
            error.kind === "unknown-outcome" ||
            (error.kind === "http" && error.status === 403),
        );
      }
    },
  });
}
