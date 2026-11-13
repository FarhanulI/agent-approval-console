import { setTimeout as sleep } from "node:timers/promises";
import { getMockAction } from "@/mocks/action-store";
import { runFixtures } from "@/mocks/fixtures/runs";
import { getRunsScenario } from "@/mocks/scenarios";
import { BackendError } from "@/features/approvals/server/actions-backend";
import { runDetailSchema, runEventSchema } from "../schemas/run";
import type { RunListEntry, RunsBackend, StoredRun } from "./runs-backend";

const APPROVAL_TIME = "2026-10-20T09:10:00.000Z";

const storedRuns: readonly StoredRun[] = runFixtures.map((detail) => ({
  tenantId: detail.id === "run_0100" || detail.id === "run_0101" || detail.id === "run_0103"
    ? "tenant_main"
    : "tenant_east",
  detail,
}));

function visible(ctxTenants: readonly string[], run: StoredRun): boolean {
  return ctxTenants.includes(run.tenantId);
}

function throwForScenario(): void {
  const scenario = getRunsScenario();
  if (scenario.kind === "server-error") {
    throw new BackendError("upstream-error", "Mock run backend failure.");
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
      throwForScenario();
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
      const run = detailFor(record);
      const scenario = getRunsScenario();
      let events = run.events;
      if (scenario.kind === "duplicate-events" && events.length > 0) {
        events = [...events, events[Math.min(1, events.length - 1)]];
      } else if (scenario.kind === "out-of-order-events") {
        events = [...events].reverse();
      }

      const lastIndex = lastEventId
        ? events.findIndex((event) => event.id === lastEventId)
        : -1;
      return {
        tenantId: record.tenantId,
        events: lastIndex >= 0 ? events.slice(lastIndex + 1) : events,
      };
    },
  };
}
