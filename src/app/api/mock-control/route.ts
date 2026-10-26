import { z } from "zod";
import { resolvePrincipal } from "@/lib/auth/principal";
import { isMockModeEnabled } from "@/lib/config/mock-mode";
import { errorResponse, getRequestId, hasTrustedOrigin, jsonResponse, unauthenticated } from "@/lib/server/http";
import { resetMockActionState } from "@/mocks/action-store";
import {
  resetAllScenarios,
  setActionsScenario,
  setDecisionScenario,
  setDetailScenario,
  type ActionsScenario,
  type DecisionScenario,
  type DetailScenario,
} from "@/mocks/scenarios";

const bodySchema = z.strictObject({
  target: z.enum(["reset", "actions", "detail", "decision"]),
  scenario: z.object({ kind: z.string() }).loose().optional(),
});

/**
 * TEST/DEV ONLY control plane for the in-memory mock backend (scenarios and
 * state reset), used by Playwright. It does not exist (404) unless mock mode is
 * on, and even then needs a session and a trusted Origin. It must never be
 * reachable in a real deployment; `isMockModeEnabled()` guarantees that.
 */
export async function POST(request: Request) {
  const requestId = getRequestId(request);
  if (!isMockModeEnabled()) return errorResponse(404, "not_found", "Not found.", requestId);
  if (!hasTrustedOrigin(request)) {
    return errorResponse(403, "invalid_origin", "The request origin is not allowed.", requestId);
  }
  const auth = await resolvePrincipal(request);
  if (!auth.authenticated) return unauthenticated(requestId);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_request", "Invalid control request.", requestId);

  const { target, scenario } = parsed.data;
  if (target === "reset") {
    resetAllScenarios();
    resetMockActionState();
  } else if (scenario) {
    // Test-only input from an authenticated tester; shape is trusted here.
    if (target === "actions") setActionsScenario(scenario as ActionsScenario);
    if (target === "detail") setDetailScenario(scenario as DetailScenario);
    if (target === "decision") setDecisionScenario(scenario as DecisionScenario);
  }
  return jsonResponse({ ok: true }, requestId);
}
