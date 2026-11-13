import { describe, expect, it } from "vitest";
import {
  clearAuditFilters,
  hasActiveAuditFilters,
  parseAuditState,
  serializeAuditState,
  toAuditQuery,
} from "./audit-state";

const parse = (query: string) => parseAuditState(new URLSearchParams(query));

describe("audit URL state", () => {
  it("round-trips filters, sort and page, omitting defaults", () => {
    const state = parse(
      "q=abc&actorId=usr_1&actorType=user&userId=usr_1&systemId=sys_1&agentId=agent_1&type=decision.denied&outcome=unknown&from=2026-10-01&to=2026-10-02&sort=asc&page=3",
    );
    expect(state).toMatchObject({
      search: "abc",
      actorId: "usr_1",
      actorType: "user",
      userId: "usr_1",
      systemId: "sys_1",
      agentId: "agent_1",
      eventType: "decision.denied",
      outcome: "unknown",
      direction: "asc",
      page: 3,
    });
    expect(serializeAuditState(state).toString()).toBe(
      "q=abc&actorId=usr_1&actorType=user&userId=usr_1&systemId=sys_1&agentId=agent_1&type=decision.denied&outcome=unknown&from=2026-10-01&to=2026-10-02&sort=asc&page=3",
    );
    expect(serializeAuditState(parse("")).toString()).toBe("");
  });

  it("falls back for invalid values and drops an inverted date range", () => {
    const state = parse("type=x&outcome=y&actorType=robot&from=2026-02-31&page=-2&sort=up");
    expect(state).toMatchObject({
      eventType: undefined,
      outcome: undefined,
      actorType: undefined,
      from: undefined,
      page: 1,
      direction: "desc",
    });
    expect(parse("from=2026-10-05&to=2026-10-01").to).toBeUndefined();
  });

  it("converts UTC calendar days to inclusive instants and clears filters", () => {
    const state = parse("from=2026-10-01&to=2026-10-02&q=x&sort=asc");
    expect(toAuditQuery(state)).toMatchObject({
      startDate: "2026-10-01T00:00:00.000Z",
      endDate: "2026-10-02T23:59:59.999Z",
      sortBy: "occurredAt",
      sortDirection: "asc",
      pageSize: 10,
    });
    expect(hasActiveAuditFilters(state)).toBe(true);
    const cleared = { ...state, ...clearAuditFilters(state) };
    expect(hasActiveAuditFilters(cleared)).toBe(false);
    expect(cleared.direction).toBe("asc");
  });

  it("maps user, system, and agent identifiers to server-side filter parameters", () => {
    expect(toAuditQuery(parse("actorType=agent&agentId=agent_inventory&actorId=agent_inventory"))).toMatchObject({
      actorType: "agent",
      actorId: "agent_inventory",
      agentId: "agent_inventory",
    });
    expect(toAuditQuery(parse("userId=usr_dev_reviewer"))).toMatchObject({
      userId: "usr_dev_reviewer",
    });
    expect(toAuditQuery(parse("systemId=system_1"))).toMatchObject({
      systemId: "system_1",
    });
  });
});
