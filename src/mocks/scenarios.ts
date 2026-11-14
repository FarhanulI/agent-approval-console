import { z } from "zod";

/**
 * Mutable MOCK scenario switches, shared by the MSW handlers (adapter tests)
 * and the server-side mock backend (BFF). State lives on `globalThis` because
 * Next.js may load a module once per route bundle; a plain module variable
 * would then not be shared between the test-control route and the API routes.
 */

export type ActionsScenario =
  | { kind: "ok"; delayMs?: number }
  | { kind: "server-error"; requestId?: string }
  | { kind: "malformed" }
  | { kind: "empty" };

export type DetailScenario =
  | { kind: "ok"; delayMs?: number }
  | { kind: "server-error"; requestId?: string }
  | { kind: "malformed" }
  | { kind: "not-found" };

/**
 * Everything except `ok` forces a response; `lost-response` commits first and
 * then loses the response, to model a decision whose answer never arrived.
 */
export type DecisionScenario =
  | { kind: "ok"; delayMs?: number }
  | { kind: "conflict" }
  | { kind: "invalid-transition" }
  | { kind: "forbidden" }
  | { kind: "server-error" }
  | { kind: "malformed" }
  | { kind: "network-error" }
  | { kind: "lost-response" };

type ScenarioState = {
  actions: ActionsScenario;
  detail: DetailScenario;
  decision: DecisionScenario;
  audit: AuditScenario;
  runs: RunsScenario;
  runStreamDisconnected: boolean;
  expiredCursorReported: boolean;
  runRecoveryRequested: boolean;
};

/** Scenario for the mock audit read API (`ok` with optional delay, error, or empty). */
export type AuditScenario =
  | { kind: "ok"; delayMs?: number }
  | { kind: "server-error" }
  | { kind: "empty" };

export const runsScenarioSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ok") }),
  z.strictObject({ kind: z.literal("empty") }),
  z.strictObject({ kind: z.literal("missing-run-detail") }),
  z.strictObject({ kind: z.literal("server-error") }),
  z.strictObject({ kind: z.literal("malformed") }),
  z.strictObject({
    kind: z.literal("delayed"),
    delayMs: z.number().int().nonnegative().optional(),
  }),
  z.strictObject({ kind: z.literal("duplicate-events") }),
  z.strictObject({ kind: z.literal("out-of-order-events") }),
  z.strictObject({ kind: z.literal("late-events") }),
  z.strictObject({ kind: z.literal("event-gap") }),
  z.strictObject({ kind: z.literal("disconnect-once") }),
  z.strictObject({ kind: z.literal("expired-cursor") }),
  z.strictObject({ kind: z.literal("history-unavailable") }),
  z.strictObject({ kind: z.literal("process-restart-history-available") }),
  z.strictObject({ kind: z.literal("process-restart-history-unavailable") }),
  z.strictObject({ kind: z.literal("run-completes-during-disconnect") }),
  z.strictObject({ kind: z.literal("snapshot-failure") }),
  z.strictObject({ kind: z.literal("snapshot-failure-on-recovery") }),
  z.strictObject({ kind: z.literal("snapshot-unavailable") }),
  z.strictObject({ kind: z.literal("snapshot-malformed") }),
]);
export type RunsScenario = z.infer<typeof runsScenarioSchema>;

const KEY = Symbol.for("agent-approval-console.mock-scenarios");
type Holder = { [KEY]?: ScenarioState };
const holder = globalThis as unknown as Holder;

function state(): ScenarioState {
  holder[KEY] ??= {
    actions: { kind: "ok" },
    detail: { kind: "ok" },
    decision: { kind: "ok" },
    audit: { kind: "ok" },
    runs: { kind: "ok" },
    runStreamDisconnected: false,
    expiredCursorReported: false,
    runRecoveryRequested: false,
  };
  return holder[KEY];
}

export const getActionsScenario = () => state().actions;
export const getDetailScenario = () => state().detail;
export const getDecisionScenario = () => state().decision;
export const getAuditScenario = () => state().audit;
export const getRunsScenario = () => state().runs;
export function consumeRunStreamDisconnect(): boolean {
  const current = state();
  const shouldDisconnect = [
    "disconnect-once",
    "process-restart-history-available",
    "process-restart-history-unavailable",
    "run-completes-during-disconnect",
  ].includes(current.runs.kind);
  if (!shouldDisconnect || current.runStreamDisconnected) {
    return false;
  }
  current.runStreamDisconnected = true;
  return true;
}
export function hasRunStreamDisconnected(): boolean {
  return state().runStreamDisconnected;
}

export function consumeExpiredRunCursor(): boolean {
  const current = state();
  if (current.runs.kind !== "expired-cursor" || current.expiredCursorReported) {
    return false;
  }
  current.expiredCursorReported = true;
  return true;
}
export function consumeRunSnapshotFailure(): boolean {
  const current = state();
  return (
    current.runs.kind === "snapshot-failure-on-recovery" &&
    current.runRecoveryRequested
  );
}
export function markRunRecoveryRequested(): void {
  state().runRecoveryRequested = true;
}

export const setActionsScenario = (next: ActionsScenario) => {
  state().actions = next;
};
export const setDetailScenario = (next: DetailScenario) => {
  state().detail = next;
};
export const setDecisionScenario = (next: DecisionScenario) => {
  state().decision = next;
};
export const setAuditScenario = (next: AuditScenario) => {
  state().audit = next;
};
export const setRunsScenario = (next: RunsScenario) => {
  const current = state();
  current.runs = next;
  current.runStreamDisconnected = false;
  current.expiredCursorReported = false;
  current.runRecoveryRequested = false;
};

export const resetActionsScenario = () => setActionsScenario({ kind: "ok" });
export const resetDetailScenario = () => setDetailScenario({ kind: "ok" });
export const resetDecisionScenario = () => setDecisionScenario({ kind: "ok" });
export const resetAuditScenario = () => setAuditScenario({ kind: "ok" });
export const resetRunsScenario = () => setRunsScenario({ kind: "ok" });

export function resetAllScenarios(): void {
  resetActionsScenario();
  resetDetailScenario();
  resetDecisionScenario();
  resetAuditScenario();
  resetRunsScenario();
}
