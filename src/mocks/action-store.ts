import {
  actionDecisionRequestSchema,
  type ActionDecisionRequest,
  type ApprovalStatus,
  type PendingAction,
} from "@/features/approvals/contracts";
import type { BrowserDecisionRequest } from "@/features/approvals/schemas/decision-request";
import { detailExtras } from "./fixtures/action-details";
import { actionFixtures } from "./fixtures/actions";

/**
 * In-memory MSW state: a status/version overlay on the immutable fixtures plus
 * a log of accepted decisions. MOCK ONLY. Nothing here proves atomicity,
 * authorization, idempotency or audit persistence of a real backend.
 *
 * The overlay lives in the module (per realm): in the browser it resets on a
 * full page load; tests must call `resetMockActionState()` in cleanup.
 */

/**
 * Test identity used by the MSW handler when it builds the contract-shaped
 * `ActionDecisionRequest`. It exists only here, mimicking what a trusted
 * server-side boundary would derive from a session. The browser never sends it.
 */
export const MOCK_ACTOR_ID = "mock_reviewer_1";

/** Fixed so responses stay deterministic. */
const MOCK_DECISION_TIME = "2026-10-17T09:00:00.000Z";

type Overlay = { status: ApprovalStatus; recordVersion: number; updatedAt: string };

/** Recorded decision for idempotent replay (MOCK semantics). */
export type RecordedDecision = {
  fingerprint: string;
  result: { status: ApprovalStatus; recordVersion: number };
};

// Shared through `globalThis` so the BFF routes and the test-control route see
// the same state even if Next.js bundles this module more than once.
type StoreState = {
  overlay: Map<string, Overlay>;
  decisionLog: ActionDecisionRequest[];
  recorded: Map<string, RecordedDecision>;
};
const STORE_KEY = Symbol.for("agent-approval-console.mock-action-store");
const storeHolder = globalThis as unknown as { [STORE_KEY]?: StoreState };
storeHolder[STORE_KEY] ??= {
  overlay: new Map(),
  decisionLog: [],
  recorded: new Map(),
};
const { overlay, decisionLog, recorded } = storeHolder[STORE_KEY];

function applyOverlay(action: PendingAction): PendingAction {
  const state = overlay.get(action.id);
  return state ? { ...action, ...state } : action;
}

/** List view: fixtures with committed decisions applied. */
export function listMockActions(): PendingAction[] {
  return actionFixtures.map(applyOverlay);
}

/** Detail view: fixture + detail-only extras + committed decisions. */
export function getMockAction(actionId: string): PendingAction | undefined {
  const base = actionFixtures.find((action) => action.id === actionId);
  if (!base) return undefined;
  return applyOverlay({ ...base, ...detailExtras[actionId] });
}

export type CommitResult =
  | { ok: true; status: ApprovalStatus; recordVersion: number }
  | { ok: false; code: "not_found" | "version_conflict" | "invalid_transition" };

/**
 * Applies the proposed atomic check-and-commit in one synchronous step
 * (JavaScript's single thread stands in for backend atomicity, which is NOT
 * verified for the real backend): action exists, status is `pending`, and the
 * submitted `recordVersion` equals the current one. A commit moves the action
 * to `approved`/`rejected` (never `executed`) and bumps the version.
 */
export function commitMockDecision(
  actionId: string,
  request: BrowserDecisionRequest,
  actorId: string = MOCK_ACTOR_ID,
): CommitResult {
  const current = getMockAction(actionId);
  if (!current) return { ok: false, code: "not_found" };
  if (current.status !== "pending") return { ok: false, code: "invalid_transition" };
  if (current.recordVersion !== request.recordVersion) {
    return { ok: false, code: "version_conflict" };
  }

  const next: Overlay = {
    status: request.decision === "approve" ? "approved" : "rejected",
    recordVersion: current.recordVersion + 1,
    updatedAt: MOCK_DECISION_TIME,
  };
  overlay.set(actionId, next);
  // Build (and validate) the contract-shaped command with the server-derived actor.
  decisionLog.push(actionDecisionRequestSchema.parse({ ...request, actorId }));
  return { ok: true, status: next.status, recordVersion: next.recordVersion };
}

export function getRecordedDecision(scope: string): RecordedDecision | undefined {
  return recorded.get(scope);
}

export function recordDecision(scope: string, entry: RecordedDecision): void {
  recorded.set(scope, entry);
}

/** Accepted decisions as the backend command shape, in commit order. */
export function getMockDecisionLog(): readonly ActionDecisionRequest[] {
  return decisionLog;
}

/** Clears committed decisions. Call in test cleanup. */
export function resetMockActionState(): void {
  overlay.clear();
  decisionLog.length = 0;
  recorded.clear();
}
