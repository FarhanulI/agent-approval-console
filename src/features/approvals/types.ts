import type {
  ActionListResponse,
  ActionQuery,
  ApprovalStatus,
  DecisionResult,
  PendingAction,
  RiskLevel,
} from "./contracts";
import type { BrowserDecisionRequest } from "./schemas/decision-request";

/**
 * PROPOSED frontend contract extension (not part of `contracts.ts`).
 *
 * The established `ActionQuery` supports page, pageSize, status, risk and
 * search only. Server-side sorting is required by the queue UI, so the sort
 * parameters are declared here, isolated from the domain contract. Whether the
 * real `erp-mcp-bridge` supports them is NOT known; until it is confirmed, only
 * the MSW handler implements them.
 */
export const ACTION_SORT_FIELDS = ["createdAt", "risk"] as const;
export type ActionSortField = (typeof ACTION_SORT_FIELDS)[number];

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export type ActionListQuery = ActionQuery & {
  sortBy?: ActionSortField;
  sortDirection?: SortDirection;
};

export type ActionSort = {
  field: ActionSortField;
  direction: SortDirection;
};

/** URL/UI state of the queue. `page` is 1-based, matching `Pagination.page`. */
export type QueueState = {
  search: string;
  status?: ApprovalStatus;
  risk?: RiskLevel;
  sort: ActionSort;
  page: number;
};

export type ListActionsOptions = {
  signal?: AbortSignal;
};

export type GetActionOptions = {
  signal?: AbortSignal;
};

/**
 * A single-item decision: the browser DTO plus the target action id.
 * `idempotencyKey` travels as the `Idempotency-Key` header, not in the body;
 * it must stay the same for resubmissions of the same logical decision.
 */
export type DecideActionInput = BrowserDecisionRequest & {
  actionId: string;
  idempotencyKey?: string;
};

/** The only thing the UI depends on; MSW and the real backend sit behind it. */
export interface ActionsService {
  /**
   * Whether this environment may send decisions. When false, `decideAction`
   * rejects with an `unavailable` error without sending a request, and the UI
   * must present decisions as unavailable.
   */
  readonly decisionsEnabled: boolean;

  listActions(
    query: ActionListQuery,
    options?: ListActionsOptions,
  ): Promise<ActionListResponse>;

  /** Proposed `GET /api/actions/:id`; rejects `not-found` on 404. */
  getAction(actionId: string, options?: GetActionOptions): Promise<PendingAction>;

  /**
   * Proposed `POST /api/actions/:id/approve|reject`. Never retried
   * automatically. See `ActionsServiceErrorKind` for outcome semantics.
   */
  decideAction(input: DecideActionInput): Promise<DecisionResult>;
}
