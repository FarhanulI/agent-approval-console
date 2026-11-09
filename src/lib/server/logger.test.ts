import { afterEach, describe, expect, it, vi } from "vitest";
import { logServerEvent } from "./logger";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("structured server logging", () => {
  it("writes correlated JSON with allow-listed fields only", () => {
    vi.stubEnv("NODE_ENV", "production");
    const output = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logServerEvent(
      "warn",
      "approvals-bff",
      "decision_denied",
      {
        requestId: "req_test123",
        route: "POST:/api/actions",
        errorCode: "invalid_origin",
        password: "must-not-be-logged",
      } as never,
    );

    const record = JSON.parse(output.mock.calls[0][0] as string) as Record<string, string>;
    expect(record).toMatchObject({
      level: "warn",
      environment: "production",
      scope: "approvals-bff",
      event: "decision_denied",
      requestId: "req_test123",
      errorCode: "invalid_origin",
    });
    expect(record).not.toHaveProperty("password");
    expect(output.mock.calls[0][0]).not.toContain("must-not-be-logged");
  });

  it("does not print unsafe context values", () => {
    vi.stubEnv("NODE_ENV", "production");
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logServerEvent("error", "approvals-bff", "unexpected_backend_error", {
      requestId: "req_test123",
      errorCode: "internal_error",
      userId: "token with spaces",
    });

    const record = JSON.parse(output.mock.calls[0][0] as string) as Record<string, string>;
    expect(record).not.toHaveProperty("userId");
    expect(record).not.toHaveProperty("stack");
  });
});
