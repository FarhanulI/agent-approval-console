import { setTimeout as sleep } from "node:timers/promises";
import { getMockAction } from "@/mocks/action-store";
import { runFixtures } from "@/mocks/fixtures/runs";
import {
  consumeExpiredRunCursor,
  consumeRunSnapshotFailure,
  getRunsScenario,
  hasRunStreamDisconnected,
  markRunRecoveryRequested,
} from "@/mocks/scenarios";
import { BackendError } from "@/features/approvals/server/actions-backend";
import { runDetailSchema, runEventSchema } from "../schemas/run";
import type { RunListEntry, RunsBackend, StoredRun } from "./runs-backend";

const APPROVAL_TIME = "2026-10-20T09:10:00.000Z";
const COMPLETION_TIME = "2026-10-20T09:20:00.000Z";

const storedRuns: readonly StoredRun[] = runFixtures.map((detail) => ({
  tenantId: detail.id === "run_0100" || detail.id === "run_0101" || detail.id === "run_0103"
    ? "tenant_main"
    : "tenant_east",
  detail,
}));

function visible(ctxTenants: readonly string[], run: StoredRun): boolean {
  return ctxTenants.includes(run.tenantId);
}

function throwForScenario(snapshotRead = false): void {
  const scenario = getRunsScenario();
  if (scenario.kind === "server-error") {
    throw new BackendError("upstream-error", "Mock run backend failure.");
  }
  if (snapshotRead && scenario.kind === "snapshot-failure") {
    throw new BackendError("timeout", "Mock run snapshot timed out.");
  }
  if (
    snapshotRead &&
    scenario.kind === "snapshot-failure-on-recovery" &&
    consumeRunSnapshotFailure()
  ) {
    throw new BackendError("timeout", "Mock run snapshot timed out.");
  }
  if (snapshotRead && scenario.kind === "snapshot-unavailable") {
    throw new BackendError("unavailable", "Mock run snapshot is unavailable.");
  }
}

async function applyDelay(): Promise<void> {
  const scenario = getRunsScenario();
  if (scenario.kind === "delayed") {
    await sleep(Math.min(Math.max(scenario.delayMs ?? 250, 0), 5000));
  }
}

function detailFor(record: StoredRun) {
  const base = record.detail;
  const scenario = getRunsScenario();
  if (
    scenario.kind === "run-completes-during-disconnect" &&
    hasRunStreamDisconnected() &&
    base.id === "run_0101" &&
    base.status === "running"
  ) {
    const completionEvent = runEventSchema.parse({
      id: `${base.id}_event_005`,
      runId: base.id,
      sequence: 5,
      type: "run.completed",
      timestamp: COMPLETION_TIME,
      payload: { message: "Run completed while its stream was disconnected." },
    });
    return runDetailSchema.parse({
      ...base,
      status: "completed",
      completedAt: COMPLETION_TIME,
      currentStep: undefined,
      steps: base.steps.map((step) =>
        step.status === "running"
          ? { ...step, status: "completed", completedAt: COMPLETION_TIME }
          : step,
      ),
      events: [...base.events, completionEvent],
      resultSummary: "The mock run completed while its event stream was disconnected.",
    });
  }

  const actionId = base.actionIds[0];
  const action = actionId ? getMockAction(actionId) : undefined;
  if (base.status !== "waiting" || !action || action.status === "pending") {
    return runDetailSchema.parse(base);
  }

  const approved = action.status === "approved";
  const resolvedEvent = runEventSchema.parse({
    id: `${base.id}_event_007`,
    runId: base.id,
    sequence: 7,
    type: "approval.resolved",
    timestamp: APPROVAL_TIME,
    stepId: "await-approval",
    payload: {
      actionId: action.id,
      decision: approved ? "approved" : "rejected",
      message: approved
        ? "Approval recorded; execution continues separately."
        : "The action was rejected; execution did not start.",
    },
  });
  const events = [...base.events, resolvedEvent];

  if (approved) {
    const executionStep = {
      id: "execute-update",
      title: "Execute approved update",
      description: "The approved action is now in a separate execution phase.",
      status: "running" as const,
      startedAt: APPROVAL_TIME,
      actionId: action.id,
    };
    events.push(
      runEventSchema.parse({
        id: `${base.id}_event_008`,
        runId: base.id,
        sequence: 8,
        type: "step.started",
        timestamp: APPROVAL_TIME,
        stepId: executionStep.id,
        payload: { message: "Execution started after approval." },
      }),
    );
    return runDetailSchema.parse({
      ...base,
      status: "running",
      currentStep: executionStep.title,
      steps: [
        ...base.steps.slice(0, -1),
        { ...base.steps.at(-1), status: "completed", completedAt: APPROVAL_TIME },
        executionStep,
      ],
      events,
      resultSummary: "Approval recorded. Business execution has not been confirmed.",
    });
  }

  return runDetailSchema.parse({
    ...base,
    status: "rejected",
    completedAt: APPROVAL_TIME,
    currentStep: undefined,
    steps: base.steps.map((step) =>
      step.id === "await-approval"
        ? { ...step, status: "cancelled", completedAt: APPROVAL_TIME }
        : step,
    ),
    events,
    resultSummary: "The action was rejected before execution.",
  });
}

export function createMockRunsBackend(): RunsBackend {
  return {
    kind: "mock",

    async list(ctx) {
      throwForScenario();
      await applyDelay();
      if (getRunsScenario().kind === "empty") return [];
      return storedRuns
        .filter((run) => visible(ctx.principal.tenantIds, run))
        .map((run) => {
          const current = detailFor(run);
          const summary = {
            id: current.id,
            status: current.status,
            summary: current.summary,
            actionIds: current.actionIds,
            startedAt: current.startedAt,
            ...(current.completedAt ? { completedAt: current.completedAt } : {}),
            ...(current.currentStep ? { currentStep: current.currentStep } : {}),
            agent: current.agent,
          };
          return { tenantId: run.tenantId, summary } satisfies RunListEntry;
        })
        .sort(
          (left, right) =>
            Date.parse(right.summary.startedAt) - Date.parse(left.summary.startedAt),
        );
    },

    async get(ctx, runId) {
      throwForScenario(true);
      await applyDelay();
      if (getRunsScenario().kind === "missing-run-detail") return undefined;
      const record = storedRuns.find(
        (run) => run.detail.id === runId && visible(ctx.principal.tenantIds, run),
      );
      return record ? { ...record, detail: detailFor(record) } : undefined;
    },

    async getEvents(ctx, runId, lastEventId) {
      throwForScenario();
      await applyDelay();
      const record = storedRuns.find(
        (run) => run.detail.id === runId && visible(ctx.principal.tenantIds, run),
      );
      if (!record) return undefined;
      const scenario = getRunsScenario();
      if (scenario.kind === "history-unavailable") {
        return { tenantId: record.tenantId, history: "unavailable" };
      }
      if (
        scenario.kind === "process-restart-history-unavailable" &&
        hasRunStreamDisconnected()
      ) {
        return { tenantId: record.tenantId, history: "unavailable" };
      }

      const events = detailFor(record).events;
      const cursorIndex = lastEventId
        ? events.findIndex((event) => event.id === lastEventId)
        : -1;
      const cursorExpired =
        (lastEventId && cursorIndex < 0) ||
        (scenario.kind === "expired-cursor" &&
          Boolean(lastEventId) &&
          consumeExpiredRunCursor()) ||
        (scenario.kind === "snapshot-failure" && Boolean(lastEventId));
      const recoverySnapshotFailure =
        scenario.kind === "snapshot-failure-on-recovery" && Boolean(lastEventId);
      if (cursorExpired || recoverySnapshotFailure) {
        if (recoverySnapshotFailure) markRunRecoveryRequested();
        return { tenantId: record.tenantId, history: "cursor-expired" };
      }

      let replay = cursorIndex >= 0 ? events.slice(cursorIndex + 1) : [...events];
      if (scenario.kind === "duplicate-events" && events.length > 0) {
        replay = [...replay, events[Math.min(1, events.length - 1)]];
      } else if (scenario.kind === "out-of-order-events") {
        replay = [...replay].reverse();
      } else if (scenario.kind === "late-events" && replay.length > 2) {
        replay = [...replay.slice(0, 1), ...replay.slice(2), replay[1]];
      } else if (scenario.kind === "event-gap" && replay.length > 2) {
        replay = replay.filter((event) => event.sequence !== 3);
      }

      return {
        tenantId: record.tenantId,
        history: "available",
        events: replay,
        ...(scenario.kind === "expired-cursor" && !lastEventId
          ? { closeAfterEvents: true }
          : {}),
        ...(scenario.kind === "snapshot-failure-on-recovery" && !lastEventId
          ? { closeAfterEvents: true }
          : {}),
      };
    },
  };
}
