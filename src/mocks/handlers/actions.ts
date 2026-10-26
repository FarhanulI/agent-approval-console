import { delay, http, HttpResponse } from "msw";
import { parseActionListQuery } from "@/features/approvals/schemas/action-list-query";
import { listMockActions } from "../action-store";
import { queryActions } from "../actions-list";
import { getActionsScenario } from "../scenarios";

export {
  resetActionsScenario,
  setActionsScenario,
  type ActionsScenario,
} from "../scenarios";

export const actionsHandlers = [
  http.get("*/api/actions", async ({ request }) => {
    const parsed = parseActionListQuery(new URL(request.url).searchParams);
    const scenario = getActionsScenario();

    if (!parsed.success) {
      return HttpResponse.json(
        {
          error: {
            code: "invalid_query",
            message: "One or more query parameters are invalid.",
            details: {
              fields: parsed.error.issues.map((issue) => issue.path.join(".")),
            },
          },
        },
        { status: 400 },
      );
    }

    if (scenario.kind === "ok" && scenario.delayMs) {
      await delay(scenario.delayMs);
    }

    switch (scenario.kind) {
      case "server-error":
        return HttpResponse.json(
          {
            error: {
              code: "internal_error",
              message: "The approvals service is temporarily unavailable.",
              requestId: scenario.requestId ?? "req_mock_500",
            },
          },
          { status: 500 },
        );
      case "malformed":
        return HttpResponse.json({ items: [{ id: 1 }], pagination: "nope" });
      case "empty":
        return HttpResponse.json(queryActions([], parsed.data));
      default:
        return HttpResponse.json(queryActions(listMockActions(), parsed.data));
    }
  }),
];
