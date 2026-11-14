import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitMockDecision,
  getMockAction,
  resetMockActionState,
} from "@/mocks/action-store";
import { resetAllScenarios, setRunsScenario } from "@/mocks/scenarios";
import {
  REVIEWER_BOTH,
  REVIEWER_MAIN,
  VIEWER_BOTH,
  sessionCookie,
  setTestEnv,
} from "@/test/auth-helpers";
import { runFixtures } from "@/mocks/fixtures/runs";
import { createBridgeRunsBackend } from "./bridge-runs-backend";
import type { RunsBackend } from "./runs-backend";
import {
  handleGetRun,
  handleListRuns,
  handleSubscribeRunEvents,
} from "./handlers";

const ORIGIN = "http://localhost:3000";

async function get(path: string, claims?: typeof REVIEWER_BOTH | null) {
  const headers: Record<string, string> = {};
  if (claims !== null) headers.cookie = await sessionCookie(claims ?? REVIEWER_BOTH);
  return new Request(`${ORIGIN}${path}`, { headers });
}

async function body(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  setTestEnv(vi);
  resetAllScenarios();
  resetMockActionState();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetAllScenarios();
  resetMockActionState();
});

describe("run API authorization and snapshots", () => {
  it("requires a session and returns tenant-scoped summaries without tenant IDs", async () => {
    const unauthorized = await handleListRuns(await get("/api/runs", null));
    expect(unauthorized.status).toBe(401);

    const response = await handleListRuns(await get("/api/runs", REVIEWER_MAIN));
    expect(response.status).toBe(200);
    const result = (await body(response)) as {
      items: { id: string; tenantId?: string }[];
    };
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((run) => run.id === "run_0100" || run.id === "run_0101" || run.id === "run_0103")).toBe(true);
    expect(result.items.some((run) => run.tenantId !== undefined)).toBe(false);
  });

  it("returns the same not-found response for a run outside the session tenant", async () => {
    const response = await handleGetRun(
      await get("/api/runs/run_0102", REVIEWER_MAIN),
      "run_0102",
    );
    expect(response.status).toBe(404);
    expect((await body(response)).error).toMatchObject({ code: "not_found" });
  });

  it("exposes the waiting action link and reflects decisions without claiming execution", async () => {
    const initialResponse = await handleGetRun(
      await get("/api/runs/run_0100"),
      "run_0100",
    );
    const initial = (await body(initialResponse)).run as {
      status: string;
      actionIds: string[];
      events: { type: string }[];
    };
    expect(initial.status).toBe("waiting");
    expect(initial.actionIds).toEqual(["act_0002", "act_0010"]);

    const decision = commitMockDecision(
      "act_0002",
      { decision: "approve", recordVersion: 2 },
      "usr_test_reviewer",
    );
    expect(decision.ok).toBe(true);
    expect(getMockAction("act_0002")?.status).toBe("approved");

    const resolvedResponse = await handleGetRun(
      await get("/api/runs/run_0100"),
      "run_0100",
    );
    const resolved = (await body(resolvedResponse)).run as {
      status: string;
      events: { type: string; payload?: { message?: string } }[];
      resultSummary?: string;
    };
    expect(resolved.status).toBe("running");
    expect(resolved.events.at(-2)?.type).toBe("approval.resolved");
    expect(resolved.resultSummary).toContain("not been confirmed");
  });

  it("fails closed when a run references a missing or cross-tenant action", async () => {
    const invalidRun = { ...runFixtures[0], actionIds: ["act_0001"] };
    const backend: RunsBackend = {
      kind: "mock",
      list: async () => [],
      get: async () => ({ tenantId: "tenant_main", detail: invalidRun }),
      getEvents: async () => undefined,
    };
    const response = await handleGetRun(
      await get("/api/runs/run_0100"),
      "run_0100",
      { backend },
    );
    expect(response.status).toBe(502);
  });

  it("returns not-found when related run details are unavailable", async () => {
    setRunsScenario({ kind: "missing-run-detail" });
    const response = await handleGetRun(
      await get("/api/runs/run_0100"),
      "run_0100",
    );
    expect(response.status).toBe(404);
    expect((await body(response)).error).toMatchObject({ code: "not_found" });
  });

  it("reports snapshot timeout and unavailability without exposing backend details", async () => {
    setRunsScenario({ kind: "snapshot-failure" });
    const timeout = await handleGetRun(
      await get("/api/runs/run_0100"),
      "run_0100",
    );
    expect(timeout.status).toBe(504);
    expect(JSON.stringify(await body(timeout))).not.toContain("Mock run snapshot timed out");

    setRunsScenario({ kind: "snapshot-unavailable" });
    const unavailable = await handleGetRun(
      await get("/api/runs/run_0100"),
      "run_0100",
    );
    expect(unavailable.status).toBe(503);

    setRunsScenario({ kind: "snapshot-malformed" });
    const malformed = await handleGetRun(
      await get("/api/runs/run_0100"),
      "run_0100",
    );
    expect(malformed.status).toBe(200);
    expect((await body(malformed)).run).toEqual({ id: "run_0100" });
  });

  it("rejects a backend snapshot associated with another run", async () => {
    const backend: RunsBackend = {
      kind: "mock",
      list: async () => [],
      get: async () => ({
        tenantId: "tenant_main",
        detail: { ...runFixtures[0], id: "run_0101", actionIds: [] },
      }),
      getEvents: async () => undefined,
    };
    const response = await handleGetRun(
      await get("/api/runs/run_0100"),
      "run_0100",
      { backend },
    );
    expect(response.status).toBe(502);
  });

  it("reports an empty result and sanitized mock backend failures", async () => {
    setRunsScenario({ kind: "empty" });
    expect(((await body(await handleListRuns(await get("/api/runs")))).items as unknown[])).toHaveLength(0);

    setRunsScenario({ kind: "server-error" });
    const failed = await handleListRuns(await get("/api/runs"));
    expect(failed.status).toBe(502);
    expect(JSON.stringify(await body(failed))).not.toContain("Mock run backend failure");
  });

  it("does not fall back to mock runs when the bridge backend is unavailable", async () => {
    const response = await handleListRuns(await get("/api/runs"), {
      backend: createBridgeRunsBackend(),
    });
    expect(response.status).toBe(503);
    expect((await body(response)).error).toMatchObject({ code: "runs_unavailable" });
  });

  it("validates run IDs and gates the event stream with run:view", async () => {
    const invalid = await handleGetRun(await get("/api/runs/%2F"), "/");
    expect(invalid.status).toBe(400);

    const events = await handleSubscribeRunEvents(
      await get("/api/runs/run_0100/events", VIEWER_BOTH),
      "run_0100",
    );
    expect(events.status).toBe(200);
    expect(events.headers.get("content-type")).toContain("text/event-stream");
    await events.body?.cancel();
  });

  it("reports expired cursors explicitly and resumes from a valid cursor", async () => {
    setRunsScenario({ kind: "expired-cursor" });
    const initial = await handleSubscribeRunEvents(
      await get("/api/runs/run_0100/events"),
      "run_0100",
    );
    expect(initial.status).toBe(200);
    expect(await initial.text()).toContain("id: run_0100_event_006");

    const expiredRequest = await get("/api/runs/run_0100/events");
    const expired = await handleSubscribeRunEvents(
      new Request(expiredRequest, {
        headers: {
          cookie: expiredRequest.headers.get("cookie") ?? "",
          "last-event-id": "run_0100_event_006",
        },
      }),
      "run_0100",
    );
    expect(await expired.text()).toContain(
      '"reason":"cursor-expired"',
    );

    const resumedRequest = await get("/api/runs/run_0100/events");
    const resumed = await handleSubscribeRunEvents(
      new Request(resumedRequest, {
        headers: {
          cookie: resumedRequest.headers.get("cookie") ?? "",
          "last-event-id": "run_0100_event_006",
        },
      }),
      "run_0100",
    );
    expect(resumed.status).toBe(200);
    await resumed.body?.cancel();
  });

  it("distinguishes unavailable event history from empty history", async () => {
    setRunsScenario({ kind: "history-unavailable" });
    const unavailable = await handleSubscribeRunEvents(
      await get("/api/runs/run_0100/events"),
      "run_0100",
    );
    const message = await unavailable.text();
    expect(message).toContain("run-recovery");
    expect(message).toContain('"reason":"history-unavailable"');
  });

  it("simulates process restart with replay continuity or unavailable history", async () => {
    setRunsScenario({ kind: "process-restart-history-available" });
    const interrupted = await handleSubscribeRunEvents(
      await get("/api/runs/run_0101/events"),
      "run_0101",
    );
    expect(await interrupted.text()).toContain("retry: 250");

    const resumedRequest = await get("/api/runs/run_0101/events");
    const resumed = await handleSubscribeRunEvents(
      new Request(resumedRequest, {
        headers: {
          cookie: resumedRequest.headers.get("cookie") ?? "",
          "last-event-id": "run_0101_event_002",
        },
      }),
      "run_0101",
    );
    const reader = resumed.body?.getReader();
    const decoder = new TextDecoder();
    let replay = "";
    while (!replay.includes("id: run_0101_event_003")) {
      const chunk = await reader?.read();
      if (!chunk || chunk.done) break;
      replay += decoder.decode(chunk.value);
    }
    await reader?.cancel();
    expect(replay).toContain("id: run_0101_event_003");

    setRunsScenario({ kind: "process-restart-history-unavailable" });
    const interruptedWithoutHistory = await handleSubscribeRunEvents(
      await get("/api/runs/run_0101/events"),
      "run_0101",
    );
    await interruptedWithoutHistory.text();
    const restartedWithoutHistory = await handleSubscribeRunEvents(
      await get("/api/runs/run_0101/events"),
      "run_0101",
    );
    expect(await restartedWithoutHistory.text()).toContain(
      '"reason":"history-unavailable"',
    );
  });
});
