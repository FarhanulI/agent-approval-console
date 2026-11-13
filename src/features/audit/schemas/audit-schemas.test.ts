import { describe, expect, it } from "vitest";
import {
  auditDetailsSchema,
  auditEventDtoSchema,
  auditEventRecordSchema,
  toAuditEventDto,
  type AuditEventRecord,
} from "./audit-event";
import { SEED_AUDIT_EVENTS } from "@/mocks/fixtures/audit-events";
import { actionFixtures } from "@/mocks/fixtures/actions";
import { runFixtures } from "@/mocks/fixtures/runs";
import { parseAuditEventQuery } from "./audit-query";

const valid: AuditEventRecord = {
  id: "evt_1",
  tenantId: "tenant_main",
  eventType: "decision.accepted",
  outcome: "success",
  occurredAt: "2026-10-01T08:00:00.000Z",
  actorType: "user",
  actorId: "usr_1",
  actionId: "act_0002",
  runId: "run_0100",
  requestId: "req_1",
  summary: "Approval accepted by the backend. Execution has not been performed.",
  details: { decision: "approve", recordVersion: 1, reasonProvided: true },
};

describe("audit event schemas", () => {
  it("parses a valid record and every seed fixture", () => {
    expect(auditEventRecordSchema.safeParse(valid).success).toBe(true);
    for (const event of SEED_AUDIT_EVENTS) {
      expect(auditEventRecordSchema.safeParse(event).success).toBe(true);
    }
  });

  it("keeps seeded action, run, audit and tenant references consistent", () => {
    const runTenant = new Map([
      ["run_0100", "tenant_main"],
      ["run_0101", "tenant_main"],
      ["run_0102", "tenant_east"],
      ["run_0103", "tenant_main"],
      ["run_0104", "tenant_east"],
    ]);
    const actions = new Map(actionFixtures.map((action) => [action.id, action]));
    const runs = new Map(runFixtures.map((run) => [run.id, run]));

    for (const action of actionFixtures) {
      if (!action.runId) continue;
      expect(runs.get(action.runId)?.actionIds).toContain(action.id);
      expect(runTenant.get(action.runId)).toBe(action.targetRecord.tenantId);
    }
    for (const run of runFixtures) {
      for (const actionId of run.actionIds) {
        expect(actions.get(actionId)?.runId).toBe(run.id);
      }
    }
    for (const event of SEED_AUDIT_EVENTS) {
      const action = actions.get(event.actionId ?? "");
      expect(action?.targetRecord.tenantId).toBe(event.tenantId);
      if (event.runId) {
        expect(action?.runId).toBe(event.runId);
        expect(runTenant.get(event.runId)).toBe(event.tenantId);
      }
    }
    expect(SEED_AUDIT_EVENTS.some((event) => event.actorType === "user" && event.runId === null)).toBe(true);
    expect(SEED_AUDIT_EVENTS.some((event) => event.actorType === "system" && event.runId === null)).toBe(true);
  });

  it("rejects unknown event types and outcomes, bad timestamps and missing fields", () => {
    expect(auditEventRecordSchema.safeParse({ ...valid, eventType: "decision.executed" }).success).toBe(false);
    expect(auditEventRecordSchema.safeParse({ ...valid, outcome: "ok" }).success).toBe(false);
    expect(auditEventRecordSchema.safeParse({ ...valid, occurredAt: "yesterday" }).success).toBe(false);
    expect(auditEventRecordSchema.safeParse({ ...valid, summary: "" }).success).toBe(false);
    expect(auditEventRecordSchema.safeParse({ ...valid, tenantId: undefined }).success).toBe(false);
    expect(auditEventRecordSchema.safeParse({ ...valid, actorType: "robot" }).success).toBe(false);
  });

  it("keeps an unknown outcome distinct from success and never labels it as executed", () => {
    const unknown = auditEventRecordSchema.parse({
      ...valid,
      eventType: "decision.outcome_unknown",
      outcome: "unknown",
    });
    expect(unknown.outcome).not.toBe("success");
    expect(auditEventRecordSchema.safeParse({ ...valid, eventType: "action.executed" }).success).toBe(false);
  });

  it("distinguishes a verified no-run event from an unavailable relationship", () => {
    const unassociated = { ...valid, tenantId: "tenant_east", actionId: "act_0001" };
    expect(auditEventRecordSchema.safeParse({ ...unassociated, runId: null }).success).toBe(true);
    expect(auditEventRecordSchema.safeParse({ ...unassociated, runId: undefined }).success).toBe(true);
    expect(auditEventRecordSchema.safeParse({ ...valid, runId: "../run" }).success).toBe(false);
    expect(toAuditEventDto({ ...unassociated, runId: null }).runId).toBeNull();
    expect(toAuditEventDto({ ...unassociated, runId: undefined })).not.toHaveProperty("runId");
  });

  it("drops tenantId and any extra backend field when mapping to the browser DTO", () => {
    const dto = toAuditEventDto({ ...valid, secretToken: "abc" } as unknown as AuditEventRecord);
    expect(dto).not.toHaveProperty("tenantId");
    expect(dto).not.toHaveProperty("secretToken");
    expect(auditEventDtoSchema.safeParse({ ...dto, tenantId: "tenant_main" }).success).toBe(false);
  });

  it("allow-lists details: free text such as a reason is rejected", () => {
    expect(auditDetailsSchema.safeParse({ decision: "approve", reason: "because" }).success).toBe(false);
    expect(auditDetailsSchema.safeParse({ reasonProvided: true }).success).toBe(true);
  });
});

describe("audit query schema", () => {
  const parse = (query: string) => parseAuditEventQuery(new URLSearchParams(query));

  it("accepts supported filters and coerces paging", () => {
    const result = parse(
      "page=2&pageSize=25&sortBy=occurredAt&sortDirection=asc&actorId=usr_1&actorType=user&userId=usr_1&systemId=sys_1&agentId=agent_1&eventType=decision.denied&outcome=unknown&actionId=act_0001&runId=run_0100&startDate=2026-10-01T00:00:00.000Z&endDate=2026-10-02T00:00:00.000Z&search=abc",
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      page: 2,
      pageSize: 25,
      sortDirection: "asc",
      actorId: "usr_1",
      actorType: "user",
      userId: "usr_1",
      systemId: "sys_1",
      agentId: "agent_1",
      runId: "run_0100",
      startDate: "2026-10-01T00:00:00.000Z",
      endDate: "2026-10-02T00:00:00.000Z",
    });
  });

  it.each([
    "tenantId=tenant_east",
    "role=reviewer",
    "page=0",
    "pageSize=101",
    "pageSize=abc",
    "sortBy=summary",
    "sortDirection=up",
    "actorType=robot",
    "actorId=%20usr_1",
    "agentId=" + "a".repeat(129),
    "eventType=nope",
    "outcome=nope",
    "actionId=../etc",
    "runId=../etc",
    "from=2026-10-02T00:00:00.000Z&to=2026-10-01T00:00:00.000Z",
    "startDate=2026-10-02T00:00:00.000Z&endDate=2026-10-01T00:00:00.000Z",
    "startDate=2026-02-30T00:00:00.000Z",
    "startDate=2026-10-01T00:00:00.000Z&from=2026-10-01T00:00:00.000Z",
    "from=2020-01-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z",
    "from=not-a-date",
    `search=${"a".repeat(201)}`,
  ])("rejects %s", (query) => {
    expect(parse(query).success).toBe(false);
  });

  it("treats empty values as not provided", () => {
    expect(parse("outcome=&search=").success).toBe(true);
  });

  it("normalizes the legacy from/to aliases to UTC startDate/endDate", () => {
    const result = parse("from=2026-10-01T00:00:00.000Z&to=2026-10-02T23:59:59.999Z");
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      startDate: "2026-10-01T00:00:00.000Z",
      endDate: "2026-10-02T23:59:59.999Z",
    });
    if (result.success) {
      expect(result.data).not.toHaveProperty("from");
      expect(result.data).not.toHaveProperty("to");
    }
  });
});
