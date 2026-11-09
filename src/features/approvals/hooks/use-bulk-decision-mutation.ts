"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { approvalKeys } from "./use-actions-query";
import { auditKeys } from "@/features/audit/hooks/use-audit-queries";
import { actionsService } from "../services";
import { ActionsServiceError } from "../services/actions-service-error";
import type { ActionsService, BulkDecisionInput } from "../types";

function logicalKey(input: BulkDecisionInput["decisions"][number]) {
  return JSON.stringify([
    input.actionId,
    input.decision,
    input.recordVersion,
    input.reason ?? "",
  ]);
}

/**
 * Submits independent decisions through the bulk service. Each logical item
 * keeps its own idempotency key while its outcome is unknown; retries are
 * always user initiated.
 */
export function useBulkDecisionMutation(
  service: ActionsService = actionsService,
) {
  const queryClient = useQueryClient();
  const keys = useRef(new Map<string, string>());

  const reconcile = (actionIds: string[]) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: approvalKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: auditKeys.lists() }),
      ...actionIds.map((actionId) =>
        queryClient.invalidateQueries({
          queryKey: approvalKeys.detail(actionId),
        }),
      ),
    ]);

  return useMutation({
    mutationFn: (input: BulkDecisionInput) =>
      service.bulkDecision({
        decisions: input.decisions.map((item) => {
          const id = logicalKey(item);
          let idempotencyKey = keys.current.get(id);
          if (!idempotencyKey) {
            idempotencyKey = crypto.randomUUID();
            keys.current.set(id, idempotencyKey);
          }
          return { ...item, idempotencyKey };
        }),
      }),
    retry: false,
    onSuccess: (result, input) => {
      for (const item of input.decisions) {
        const outcome = result.results.find(
          (entry) => entry.actionId === item.actionId,
        )?.outcome;
        if (outcome !== "outcome_unknown") keys.current.delete(logicalKey(item));
      }
      return reconcile(input.decisions.map((item) => item.actionId));
    },
    onError: (error, input) => {
      if (!(error instanceof ActionsServiceError && error.kind === "unknown-outcome")) {
        for (const item of input.decisions) keys.current.delete(logicalKey(item));
      }
      if (
        error instanceof ActionsServiceError &&
        (error.kind === "unknown-outcome" ||
          error.kind === "conflict" ||
          error.kind === "not-found" ||
          (error.kind === "http" && error.status === 403))
      ) {
        return reconcile(input.decisions.map((item) => item.actionId));
      }
    },
  });
}
