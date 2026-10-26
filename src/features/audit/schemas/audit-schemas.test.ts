import { describe, expect, it } from "vitest";
import {
  auditDetailsSchema,
  auditEventDtoSchema,
  auditEventRecordSchema,
  toAuditEventDto,
  type AuditEventRecord,
} from "./audit-event";
import { SEED_AUDIT_EVENTS } from "@/mocks/fixtures/audit-events";
import { parseAuditEventQuery } from "./audit-query";

const valid: AuditEventRecord = {
  id: "evt_1",
  tenantId: "tenant_main",
  eventType: "decision.accepted",
  outcome: "success",
  occurredAt: "2026-10-01T08:00:00.000Z",
  actorType: "user",
  actorId: "usr_1",
  actionId: "act_0001",
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
      "page=2&pageSize=25&sortBy=occurredAt&sortDirection=asc&eventType=decision.denied&outcome=unknown&actionId=act_0001&from=2026-10-01T00:00:00.000Z&to=2026-10-02T00:00:00.000Z&search=abc",
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ page: 2, pageSize: 25, sortDirection: "asc" });
  });

  it.each([
    "tenantId=tenant_east",
    "actorId=usr_1",
    "role=reviewer",
    "page=0",
    "pageSize=101",
    "pageSize=abc",
    "sortBy=summary",
    "sortDirection=up",
    "eventType=nope",
    "outcome=nope",
    "actionId=../etc",
    "from=2026-10-02T00:00:00.000Z&to=2026-10-01T00:00:00.000Z",
    "from=2020-01-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z",
    "from=not-a-date",
    `search=${"a".repeat(201)}`,
  ])("rejects %s", (query) => {
    expect(parse(query).success).toBe(false);
  });

  it("treats empty values as not provided", () => {
    expect(parse("outcome=&search=").success).toBe(true);
  });
});
