import { delay, http, HttpResponse } from "msw";
import { parseActionListQuery } from "@/features/approvals/schemas/action-list-query";
import { actionFixtures } from "../fixtures/actions";
import { queryActions } from "../actions-list";

/**
 * Test/dev scenario switch. Handlers default to "ok". Tests flip it to
 * simulate failures without touching the UI or the service.
 */
export type ActionsScenario =
  | { kind: "ok"; delayMs?: number }
  | { kind: "server-error"; requestId?: string }
  | { kind: "malformed" }
  | { kind: "empty" };

let scenario: ActionsScenario = { kind: "ok" };

export function setActionsScenario(next: ActionsScenario): void {
  scenario = next;
}

export function resetActionsScenario(): void {
  scenario = { kind: "ok" };
}

export const actionsHandlers = [
  http.get("*/api/actions", async ({ request }) => {
    const parsed = parseActionListQuery(new URL(request.url).searchParams);

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
        return HttpResponse.json(queryActions(actionFixtures, parsed.data));
    }
  }),
];
