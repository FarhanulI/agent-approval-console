import type {
  ApprovalStatus,
  PendingAction,
  RiskLevel,
} from "@/features/approvals/contracts";

/**
 * Deterministic fixtures for the actions list. Nothing here is random or
 * clock-dependent so that tests and E2E runs always see the same queue.
 * Every field and enum value comes from the existing domain contract.
 */

type Template = {
  title: string;
  summary: string;
  entity: string;
  field: string;
  label: string;
  before: string | number;
  after: string | number;
  agent: { id: string; name: string; model?: string };
};

const templates: readonly Template[] = [
  {
    title: "Update credit limit",
    summary: "Raise the credit limit after consistently on-time payments.",
    entity: "customer",
    field: "creditLimit",
    label: "Credit limit",
    before: 50000,
    after: 75000,
    agent: { id: "agent_finance", name: "Finance Agent", model: "claude-sonnet-5-5" },
  },
  {
    title: "Merge duplicate supplier records",
    summary: "Two supplier records share the same tax ID and bank account.",
    entity: "supplier",
    field: "mergedInto",
    label: "Merged into",
    before: "—",
    after: "SUP-1042",
    agent: { id: "agent_master_data", name: "Master Data Agent" },
  },
  {
    title: "Adjust stock quantity",
    summary: "Cycle count differs from the system quantity for this item.",
    entity: "inventory_item",
    field: "onHand",
    label: "On hand",
    before: 120,
    after: 96,
    agent: { id: "agent_inventory", name: "Inventory Agent", model: "claude-haiku-5-5" },
  },
  {
    title: "Correct invoice tax code",
    summary: "Invoice was posted with a tax code that does not match the ship-to region.",
    entity: "invoice",
    field: "taxCode",
    label: "Tax code",
    before: "VAT-STD",
    after: "VAT-RED",
    agent: { id: "agent_finance", name: "Finance Agent", model: "claude-sonnet-5-5" },
  },
  {
    title: "Change payment terms",
    summary: "Customer requested net-45 terms; account history supports the change.",
    entity: "customer",
    field: "paymentTerms",
    label: "Payment terms",
    before: "Net 30",
    after: "Net 45",
    agent: { id: "agent_collections", name: "Collections Agent" },
  },
  {
    title: "Deactivate dormant vendor",
    summary: "No transactions in 24 months and the contract has lapsed.",
    entity: "supplier",
    field: "active",
    label: "Active",
    before: "true",
    after: "false",
    agent: { id: "agent_master_data", name: "Master Data Agent" },
  },
  {
    title: "Reassign sales order warehouse",
    summary: "Primary warehouse is out of stock; reroute to the regional warehouse.",
    entity: "sales_order",
    field: "warehouse",
    label: "Warehouse",
    before: "WH-NORTH",
    after: "WH-CENTRAL",
    agent: { id: "agent_fulfilment", name: "Fulfilment Agent", model: "claude-haiku-5-5" },
  },
  {
    title: "Write off small balance",
    summary: "Residual balance is below the write-off threshold.",
    entity: "invoice",
    field: "openBalance",
    label: "Open balance",
    before: 18.4,
    after: 0,
    agent: { id: "agent_collections", name: "Collections Agent" },
  },
];

const statusCycle: readonly ApprovalStatus[] = [
  "pending",
  "pending",
  "pending",
  "approved",
  "pending",
  "rejected",
  "pending",
  "pending",
  "expired",
  "pending",
  "executed",
  "pending",
  "failed",
  "cancelled",
  "pending",
  "conflict",
  "pending",
  "executing",
];

const riskCycle: readonly RiskLevel[] = [
  "low",
  "medium",
  "high",
  "critical",
  "medium",
  "low",
  "high",
  "medium",
  "low",
  "critical",
  "medium",
];

const ACTION_COUNT = 47;
const BASE_TIME = Date.parse("2026-10-01T08:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function buildAction(index: number): PendingAction {
  const template = templates[index % templates.length];
  const status = statusCycle[index % statusCycle.length];
  const risk = riskCycle[(index * 3) % riskCycle.length];
  const created = BASE_TIME + index * 7 * HOUR;
  const updated = created + ((index % 5) + 1) * HOUR;
  const recordNumber = 1000 + ((index * 37) % 900);
  const runNumber = 100 + Math.floor(index / 3);

  return {
    id: `act_${pad(index + 1, 4)}`,
    title: template.title,
    summary: template.summary,
    status,
    risk,
    targetRecord: {
      entity: template.entity,
      recordId: `${template.entity.slice(0, 3).toUpperCase()}-${recordNumber}`,
      label: `${template.entity.replace("_", " ")} ${recordNumber}`,
      tenantId: index % 4 === 0 ? "tenant_east" : "tenant_main",
    },
    recordVersion: (index % 6) + 1,
    changes: [
      {
        field: template.field,
        label: template.label,
        before: template.before,
        after: template.after,
      },
    ],
    evidence: [],
    // Every fourth action has no run reference, to exercise optional fields.
    runId: index % 4 === 3 ? undefined : `run_${pad(runNumber, 4)}`,
    agent: template.agent,
    createdAt: new Date(created).toISOString(),
    updatedAt: new Date(updated).toISOString(),
    decisionDeadline:
      status === "pending" && index % 3 === 0
        ? new Date(created + 72 * HOUR).toISOString()
        : undefined,
  };
}

export const actionFixtures: readonly PendingAction[] = Array.from(
  { length: ACTION_COUNT },
  (_, index) => buildAction(index),
);
