import type {
  ActionDecisionRequest,
  ActionListResponse,
  ApprovalStatus,
  DecisionResult,
  PendingAction,
} from "@/features/approvals/contracts";
import type { Principal } from "@/lib/auth/principal";
import type { ActionListQuery } from "../types";
import type { BulkDecisionItemRequest } from "../schemas/bulk-decision";

export type BackendContext = {
  requestId: string;
  /** Trusted identity from the session; backends scope and attribute by it. */
  principal: Principal;
};

/**
 * - `unavailable`: no verified backend contract; nothing was sent.
 * - `upstream-error`: the backend answered with a failure.
 * - `timeout`: the connection failed or timed out; for a decision the outcome
 *   is UNKNOWN (it may have been committed).
 */
export class BackendError extends Error {
  constructor(
    readonly kind: "unavailable" | "upstream-error" | "timeout",
    message: string,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

/** What the BFF sends to the backend for one decision. */
export type DecideCommand = {
  /** Contract-shaped command; `actorId` is derived from the session by the BFF. */
  command: ActionDecisionRequest;
  actionId: string;
  tenantId: string;
  idempotencyKey: string;
};

export type DecideOutcome =
  | { kind: "committed"; result: DecisionResult }
  | { kind: "replayed"; result: DecisionResult }
  | {
      kind: "rejected";
      code:
        | "not_found"
        | "version_conflict"
        | "invalid_transition"
        | "forbidden"
        | "idempotency_key_reuse";
    };

export type BulkDecideCommand = Omit<
  BulkDecisionItemRequest,
  "idempotencyKey"
> & {
  tenantId: string;
};

export type BulkDecideOutcome =
  | {
      actionId: string;
      decision: "approve" | "reject";
      kind: "committed";
      result: DecisionResult;
    }
  | {
      actionId: string;
      decision: "approve" | "reject";
      kind: "rejected";
      code:
        | "not_found"
        | "version_conflict"
        | "invalid_transition"
        | "forbidden"
        | "idempotency_key_reuse";
    }
  | {
      actionId: string;
      decision: "approve" | "reject";
      kind: "replayed";
      result: DecisionResult;
    }
  | {
      actionId: string;
      decision: "approve" | "reject";
      kind: "outcome_unknown";
    };

export type RecordedLookup =
  | { kind: "none" }
  | {
      kind: "replay";
      result: { status: ApprovalStatus; recordVersion: number };
    }
  | { kind: "key-reuse" };

/**
 * Server-side port to the approvals backend. The BFF depends only on this
 * interface. The `mock` implementation is in-memory and MSW-era only; the
 * `bridge` implementation is intentionally unavailable until the
 * `erp-mcp-bridge` contract (auth mechanism, actor propagation, endpoints,
 * idempotency, atomic transitions, tenant enforcement) is verified.
 */
export interface ActionsBackend {
  readonly kind: "mock" | "bridge";
  /** Must return only actions in `ctx.principal.tenantIds`. */
  listActions(
    ctx: BackendContext,
    query: ActionListQuery,
  ): Promise<ActionListResponse>;
  getAction(
    ctx: BackendContext,
    actionId: string,
  ): Promise<PendingAction | undefined>;
  findRecordedDecision(
    ctx: BackendContext,
    scope: string,
    fingerprint: string,
  ): Promise<RecordedLookup>;
  decide(ctx: BackendContext, command: DecideCommand): Promise<DecideOutcome>;
  /** Each item is an independent transition; the batch is not transactional. */
  bulkDecide(
    ctx: BackendContext,
    commands: readonly (BulkDecideCommand & { idempotencyKey: string })[],
  ): Promise<BulkDecideOutcome[]>;
}
