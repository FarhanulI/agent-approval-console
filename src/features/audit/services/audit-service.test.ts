import { describe, expect, it, vi } from "vitest";
import { createHttpAuditService } from "./audit-service";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const event = {
  id: "evt_1",
  eventType: "decision.accepted",
  outcome: "success",
  occurredAt: "2026-10-01T08:00:00.000Z",
  actorType: "user",
  summary: "ok",
};
const page = { items: [event], pagination: { page: 1, pageSize: 10, total: 1 } };

const serviceWith = (respond: () => Response | Promise<Response>) =>
  createHttpAuditService({ fetchFn: vi.fn<Fetch>(async () => respond()) });

describe("audit service", () => {
  it("serializes the query and validates the response", async () => {
    const fetchFn = vi.fn<Fetch>(async () => Response.json(page));
    const service = createHttpAuditService({ fetchFn });
    const result = await service.listEvents({ page: 2, outcome: "unknown", search: "a b" });
    expect(fetchFn.mock.calls[0]![0]).toBe("/api/audit-events?page=2&outcome=unknown&search=a+b");
    expect(result.items[0]!.outcome).toBe("success");
  });

  it("rejects malformed bodies, including a smuggled tenantId", async () => {
    await expect(serviceWith(() => Response.json({ items: [{ id: 1 }], pagination: 1 })).listEvents({})).rejects.toMatchObject({ kind: "malformed" });
    const leaky = { ...page, items: [{ ...event, tenantId: "tenant_east" }] };
    await expect(serviceWith(() => Response.json(leaky)).listEvents({})).rejects.toMatchObject({ kind: "malformed" });
  });

  it("maps errors without retrying", async () => {
    const fetchFn = vi.fn<Fetch>(async () =>
      Response.json({ error: { code: "audit_unavailable", message: "n/a", requestId: "req_1" } }, { status: 503 }),
    );
    const service = createHttpAuditService({ fetchFn });
    await expect(service.listEvents({})).rejects.toMatchObject({ kind: "http", status: 503, code: "audit_unavailable", requestId: "req_1" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await expect(serviceWith(() => Response.json({}, { status: 404 })).getEvent("evt_1")).rejects.toMatchObject({ kind: "not-found" });
    await expect(createHttpAuditService({ fetchFn: async () => { throw new TypeError("boom"); } }).listEvents({})).rejects.toMatchObject({ kind: "network" });
  });

  it("treats a different event id as malformed and encodes ids", async () => {
    const fetchFn = vi.fn<Fetch>(async () => Response.json(event));
    const service = createHttpAuditService({ fetchFn });
    await expect(service.getEvent("evt_2")).rejects.toMatchObject({ kind: "malformed" });
    await service.getEvent("evt_1");
    expect(fetchFn.mock.calls[1]![0]).toBe("/api/audit-events/evt_1");
  });
});
