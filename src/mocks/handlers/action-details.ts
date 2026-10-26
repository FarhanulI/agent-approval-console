import { delay, http, HttpResponse } from "msw";
import { browserDecisionRequestSchema } from "@/features/approvals/schemas/decision-request";
import { commitMockDecision, getMockAction } from "../action-store";
import { getDecisionScenario, getDetailScenario } from "../scenarios";

/**
 * MSW implementation of the PROPOSED detail and decision endpoints, used by
 * adapter tests (`msw/node`). The running app answers these routes through the
 * server-side BFF instead. It is not the real `erp-mcp-bridge`, and nothing
 * here (version checks, 409 codes, state transitions, the decision log)
 * demonstrates a real backend guarantee.
 */

export {
  resetDecisionScenario,
  resetDetailScenario,
  setDecisionScenario,
  setDetailScenario,
  type DecisionScenario,
  type DetailScenario,
} from "../scenarios";

const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function apiError(
  status: number,
  code: string,
  message: string,
  extra: { requestId?: string; details?: Record<string, unknown> } = {},
) {
  return HttpResponse.json({ error: { code, message, ...extra } }, { status });
}

const invalidId = () =>
  apiError(400, "invalid_request", "The action identifier is invalid.");

function decisionHandler(decision: "approve" | "reject") {
  return http.post(
    `*/api/actions/:actionId/${decision}`,
    async ({ params, request }) => {
      const actionId = String(params.actionId);
      if (!ACTION_ID_PATTERN.test(actionId)) return invalidId();

      // Strict DTO: a browser-supplied `actorId` (or any unknown key) is rejected.
      const body: unknown = await request.json().catch(() => null);
      const parsed = browserDecisionRequestSchema.safeParse(body);
      if (!parsed.success || parsed.data.decision !== decision) {
        return apiError(400, "invalid_request", "The decision request is invalid.", {
          details: {
            fields: parsed.success
              ? ["decision"]
              : parsed.error.issues.map((issue) => issue.path.join(".") || "(body)"),
          },
        });
      }

      const scenario = getDecisionScenario();
      if (scenario.kind === "ok" && scenario.delayMs) await delay(scenario.delayMs);

      switch (scenario.kind) {
        case "conflict":
          return apiError(409, "version_conflict", "The action changed since it was loaded.");
        case "invalid-transition":
          return apiError(409, "invalid_transition", "The action cannot take this decision in its current state.");
        case "forbidden":
          return apiError(403, "forbidden", "You are not permitted to decide this action.");
        case "server-error":
          return apiError(500, "internal_error", "The approvals service is temporarily unavailable.", {
            requestId: "req_mock_500",
          });
        case "malformed":
          return HttpResponse.json({ ok: true });
        case "network-error":
          return HttpResponse.error();
        default:
          break;
      }

      const result = commitMockDecision(actionId, parsed.data);
      if (!result.ok) {
        if (result.code === "not_found") {
          return apiError(404, "not_found", "Action not found.");
        }
        return apiError(
          409,
          result.code,
          result.code === "version_conflict"
            ? "The action changed since it was loaded."
            : "The action cannot take this decision in its current state.",
        );
      }
      if (scenario.kind === "lost-response") return HttpResponse.error();

      return HttpResponse.json({
        actionId,
        decision,
        status: result.status,
        recordVersion: result.recordVersion,
        message: "Decision recorded by the mock API. Execution has not been performed.",
      });
    },
  );
}

export const actionDetailHandlers = [
  http.get("*/api/actions/:actionId", async ({ params }) => {
    const actionId = String(params.actionId);
    if (!ACTION_ID_PATTERN.test(actionId)) return invalidId();

    const scenario = getDetailScenario();
    if (scenario.kind === "ok" && scenario.delayMs) await delay(scenario.delayMs);

    switch (scenario.kind) {
      case "server-error":
        return apiError(500, "internal_error", "The approvals service is temporarily unavailable.", {
          requestId: scenario.requestId ?? "req_mock_500",
        });
      case "malformed":
        return HttpResponse.json({ id: actionId, title: 42 });
      case "not-found":
        return apiError(404, "not_found", "Action not found.");
      default: {
        const action = getMockAction(actionId);
        return action ? HttpResponse.json(action) : apiError(404, "not_found", "Action not found.");
      }
    }
  }),
  decisionHandler("approve"),
  decisionHandler("reject"),
];
