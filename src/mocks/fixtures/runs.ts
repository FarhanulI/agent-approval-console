import type { RunDetail } from "@/features/runs/schemas/run";

const BASE = "2026-10-20T09:00:00.000Z";
const MINUTE = 60_000;

function at(minutes: number): string {
  return new Date(Date.parse(BASE) + minutes * MINUTE).toISOString();
}

function event(
  runId: string,
  sequence: number,
  type: RunDetail["events"][number]["type"],
  payload: RunDetail["events"][number]["payload"] = undefined,
  stepId?: string,
) {
  return {
    id: `${runId}_event_${String(sequence).padStart(3, "0")}`,
    runId,
    sequence,
    type,
    timestamp: at(sequence),
    ...(stepId ? { stepId } : {}),
    ...(payload ? { payload } : {}),
  };
}

const waitingRun: RunDetail = {
  id: "run_0100",
  status: "waiting",
  summary: "Review and merge duplicate supplier records.",
  actionIds: ["act_0002"],
  startedAt: at(0),
  currentStep: "Awaiting reviewer decision",
  agent: { id: "agent_master_data", name: "Master Data Agent" },
  steps: [
    {
      id: "load-customer",
      title: "Load customer record",
      description: "Read the customer account and recent payment history.",
      status: "completed",
      startedAt: at(1),
      completedAt: at(2),
      durationMs: 1200,
    },
    {
      id: "propose-limit",
      title: "Propose credit limit update",
      description: "Prepare the proposed change for human review.",
      status: "completed",
      startedAt: at(3),
      completedAt: at(4),
      durationMs: 900,
    },
    {
      id: "await-approval",
      title: "Await reviewer decision",
      description: "The agent is paused until the linked action is reviewed.",
      status: "waiting",
      startedAt: at(5),
      actionId: "act_0002",
    },
  ],
  events: [
    event("run_0100", 1, "run.started", { message: "Run started." }),
    event("run_0100", 2, "step.started", { message: "Reading customer history." }, "load-customer"),
    event("run_0100", 3, "step.completed", { message: "Customer history loaded." }, "load-customer"),
    event("run_0100", 4, "step.started", { message: "Preparing a proposed update." }, "propose-limit"),
    event("run_0100", 5, "step.completed", { message: "Proposal is ready for review." }, "propose-limit"),
    event(
      "run_0100",
      6,
      "approval.required",
      { actionId: "act_0002", message: "Human approval is required." },
      "await-approval",
    ),
  ],
};

export const runFixtures: readonly RunDetail[] = [
  waitingRun,
  {
    id: "run_0101",
    status: "running",
    summary: "Reconcile a supplier's tax registration details.",
    actionIds: [],
    startedAt: at(-3),
    currentStep: "Compare tax registration",
    agent: { id: "agent_master_data", name: "Master Data Agent" },
    steps: [
      {
        id: "find-supplier",
        title: "Find supplier record",
        description: "Locate the supplier using the supplied registration reference.",
        status: "completed",
        startedAt: at(-2),
        completedAt: at(-1),
        durationMs: 850,
      },
      {
        id: "compare-registration",
        title: "Compare tax registration",
        description: "Compare the submitted registration with the supplier record.",
        status: "running",
        startedAt: at(0),
      },
    ],
    events: [
      event("run_0101", 1, "run.started", { message: "Run started." }),
      event("run_0101", 2, "step.started", { message: "Finding supplier record." }, "find-supplier"),
      event("run_0101", 3, "step.completed", { message: "Supplier record found." }, "find-supplier"),
      event("run_0101", 4, "step.started", { message: "Comparing tax registration." }, "compare-registration"),
    ],
  },
  {
    id: "run_0102",
    status: "completed",
    summary: "Validate the latest inventory cycle-count results.",
    actionIds: [],
    startedAt: at(-90),
    completedAt: at(-82),
    agent: { id: "agent_inventory", name: "Inventory Agent", model: "claude-haiku-5-5" },
    steps: [
      {
        id: "read-count",
        title: "Read cycle-count results",
        description: "Load the latest submitted inventory count.",
        status: "completed",
        startedAt: at(-90),
        completedAt: at(-87),
        durationMs: 2700,
      },
      {
        id: "validate-count",
        title: "Validate inventory count",
        description: "Check the count against the configured validation rules.",
        status: "completed",
        startedAt: at(-87),
        completedAt: at(-82),
        durationMs: 4800,
      },
    ],
    events: [
      event("run_0102", 1, "run.started", { message: "Run started." }),
      event("run_0102", 2, "step.started", { message: "Reading cycle-count results." }, "read-count"),
      event("run_0102", 3, "step.completed", { message: "Cycle-count results loaded." }, "read-count"),
      event("run_0102", 4, "step.started", { message: "Validating inventory count." }, "validate-count"),
      event("run_0102", 5, "step.completed", { message: "Inventory count validated." }, "validate-count"),
      event("run_0102", 6, "run.completed", { message: "Run completed successfully." }),
    ],
    resultSummary: "Inventory count passed validation. No record was changed.",
  },
  {
    id: "run_0103",
    status: "failed",
    summary: "Synchronize a customer account profile.",
    actionIds: [],
    startedAt: at(-180),
    completedAt: at(-175),
    agent: { id: "agent_finance", name: "Finance Agent" },
    steps: [
      {
        id: "load-profile",
        title: "Load customer profile",
        description: "Read the profile required for synchronization.",
        status: "completed",
        startedAt: at(-180),
        completedAt: at(-178),
        durationMs: 1900,
      },
      {
        id: "sync-profile",
        title: "Synchronize profile",
        description: "Send the validated profile to the mock destination.",
        status: "failed",
        startedAt: at(-178),
        completedAt: at(-175),
        durationMs: 3100,
        errorSummary: "The mock destination rejected the profile.",
      },
    ],
    events: [
      event("run_0103", 1, "run.started", { message: "Run started." }),
      event("run_0103", 2, "step.started", { message: "Loading customer profile." }, "load-profile"),
      event("run_0103", 3, "step.completed", { message: "Customer profile loaded." }, "load-profile"),
      event("run_0103", 4, "step.started", { message: "Synchronizing profile." }, "sync-profile"),
      event("run_0103", 5, "step.failed", { message: "Mock destination rejected the profile." }, "sync-profile"),
      event("run_0103", 6, "run.failed", { message: "Run failed before synchronization completed." }),
    ],
    errorSummary: "The mock destination rejected the profile.",
  },
  {
    id: "run_0104",
    status: "cancelled",
    summary: "Check an archived purchase order.",
    actionIds: [],
    startedAt: at(-240),
    completedAt: at(-238),
    agent: { id: "agent_fulfilment", name: "Fulfilment Agent" },
    steps: [
      {
        id: "check-order",
        title: "Check purchase order",
        description: "The run was cancelled before the order could be checked.",
        status: "cancelled",
        startedAt: at(-240),
        completedAt: at(-238),
        durationMs: 1400,
      },
    ],
    events: [
      event("run_0104", 1, "run.started", { message: "Run started." }),
      event("run_0104", 2, "step.started", { message: "Checking purchase order." }, "check-order"),
      event("run_0104", 3, "run.cancelled", { message: "Run cancelled by the mock scenario." }),
    ],
  },
];
