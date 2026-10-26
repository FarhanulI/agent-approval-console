import { describe, expect, it, vi } from "vitest";
import { createHttpActionsService } from "./actions-service";

const ok = {
  actionId: "act_0001",
  decision: "approve",
  status: "approved",
  recordVersion: 2,
  message: "ok",
};

const input = { actionId: "act_0001", decision: "approve", recordVersion: 1 } as const;

describe("decision transport (client side of the BFF boundary)", () => {
  it("sends the idempotency key as a header and never as an actor in the body", async () => {
    const fetchFn = vi.fn(async (...args: [string, RequestInit?]) => {
      void args;
      return Response.json(ok);
    });
    const service = createHttpActionsService({ fetchFn, decisionsEnabled: true });
    await service.decideAction({ ...input, idempotencyKey: "key-key-key-key-key-1" });
    const init = fetchFn.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe("key-key-key-key-key-1");
    expect(JSON.parse(String(init.body))).toEqual({ decision: "approve", recordVersion: 1 });
  });

  it("maps 503 decisions_unavailable to unavailable (nothing sent), not unknown-outcome", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json(
        { error: { code: "decisions_unavailable", message: "unavailable" } },
        { status: 503 },
      ),
    );
    const service = createHttpActionsService({ fetchFn, decisionsEnabled: true });
    await expect(service.decideAction(input)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("keeps treating a gateway 5xx as an unknown outcome and does not retry", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ error: { code: "decision_outcome_unknown", message: "unknown" } }, { status: 504 }),
    );
    const service = createHttpActionsService({ fetchFn, decisionsEnabled: true });
    await expect(service.decideAction(input)).rejects.toMatchObject({ kind: "unknown-outcome" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
