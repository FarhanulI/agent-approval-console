import { setTimeout as sleep } from "node:timers/promises";
import {
  commitMockDecision,
  getMockAction,
  getRecordedDecision,
  listMockActions,
  recordDecision,
} from "@/mocks/action-store";
import { queryActions } from "@/mocks/actions-list";
import {
  getActionsScenario,
  getDecisionScenario,
  getDetailScenario,
} from "@/mocks/scenarios";
import { BackendError, type ActionsBackend } from "./actions-backend";

/**
 * In-memory backend for development and tests. MOCK ONLY: its tenant scoping,
 * version check, idempotent replay and atomic commit are simulations and prove
 * nothing about `erp-mcp-bridge`.
 */
export function createMockBackend(): ActionsBackend {
  return {
    kind: "mock",

    async listActions(ctx, query) {
      const scenario = getActionsScenario();
      if (scenario.kind === "ok" && scenario.delayMs) await sleep(scenario.delayMs);
      if (scenario.kind === "server-error" || scenario.kind === "malformed") {
        throw new BackendError("upstream-error", "Mock upstream failure.");
      }
      const visible =
        scenario.kind === "empty"
          ? []
          : listMockActions().filter(
              (action) =>
                action.targetRecord.tenantId !== undefined &&
                ctx.principal.tenantIds.includes(action.targetRecord.tenantId),
            );
      return queryActions(visible, query);
    },

    async getAction(_ctx, actionId) {
      const scenario = getDetailScenario();
      if (scenario.kind === "ok" && scenario.delayMs) await sleep(scenario.delayMs);
      switch (scenario.kind) {
        case "server-error":
        case "malformed":
          throw new BackendError("upstream-error", "Mock upstream failure.");
        case "not-found":
          return undefined;
        default:
          // Tenant authorization is applied by the BFF on the returned record.
          return getMockAction(actionId);
      }
    },

    async findRecordedDecision(_ctx, scope, fingerprint) {
      const recorded = getRecordedDecision(scope);
      if (!recorded) return { kind: "none" };
      return recorded.fingerprint === fingerprint
        ? { kind: "replay", result: recorded.result }
        : { kind: "key-reuse" };
    },

    async decide(ctx, { command, actionId, tenantId, idempotencyKey }) {
      const scenario = getDecisionScenario();
      if (scenario.kind === "ok" && scenario.delayMs) await sleep(scenario.delayMs);
      switch (scenario.kind) {
        case "conflict":
          return { kind: "rejected", code: "version_conflict" };
        case "invalid-transition":
          return { kind: "rejected", code: "invalid_transition" };
        case "forbidden":
          return { kind: "rejected", code: "forbidden" };
        case "server-error":
        case "malformed":
          throw new BackendError("upstream-error", "Mock upstream failure.");
        case "network-error":
          throw new BackendError("timeout", "Mock connection failure.");
        default:
          break;
      }

      const committed = commitMockDecision(
        actionId,
        {
          decision: command.decision,
          reason: command.reason,
          recordVersion: command.recordVersion,
        },
        command.actorId,
      );
      if (!committed.ok) return { kind: "rejected", code: committed.code };

      recordDecision(
        `${ctx.principal.userId}|${tenantId}|${actionId}|${command.decision}|${idempotencyKey}`,
        {
          fingerprint: JSON.stringify([
            command.decision,
            command.recordVersion,
            command.reason ?? "",
          ]),
          result: { status: committed.status, recordVersion: committed.recordVersion },
        },
      );

      if (scenario.kind === "lost-response") {
        throw new BackendError("timeout", "Mock response lost after commit.");
      }
      return {
        kind: "committed",
        result: {
          actionId,
          decision: command.decision,
          status: committed.status,
          recordVersion: committed.recordVersion,
          message: "Decision recorded by the mock API. Execution has not been performed.",
        },
      };
    },
  };
}
