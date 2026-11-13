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
};

/** Scenario for the mock audit read API (`ok` with optional delay, error, or empty). */
export type AuditScenario =
  | { kind: "ok"; delayMs?: number }
  | { kind: "server-error" }
  | { kind: "empty" };

export type RunsScenario =
  | { kind: "ok" }
  | { kind: "empty" }
  | { kind: "missing-run-detail" }
  | { kind: "server-error" }
  | { kind: "malformed" }
  | { kind: "delayed"; delayMs?: number }
  | { kind: "duplicate-events" }
  | { kind: "out-of-order-events" }
  | { kind: "disconnect-once" };

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
  if (
    current.runs.kind !== "disconnect-once" ||
    current.runStreamDisconnected
  ) {
    return false;
  }
  current.runStreamDisconnected = true;
  return true;
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
