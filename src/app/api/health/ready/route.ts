import { getReadinessSnapshot } from "@/lib/config/readiness";
import { getRequestId, jsonResponse } from "@/lib/server/http";
import { logServerEvent } from "@/lib/server/logger";

export function GET(request: Request) {
  const requestId = getRequestId(request);
  const readiness = getReadinessSnapshot();
  if (!readiness.ready) {
    logServerEvent("warn", "health", "readiness_failed", {
      requestId,
      errorCode: readiness.configurationReady
        ? "backend_unavailable"
        : "configuration_incomplete",
    });
  }
  return jsonResponse(
    {
      status: readiness.ready ? "ready" : "not_ready",
      mode: readiness.mode,
      checks: {
        configuration: readiness.configurationReady ? "ok" : "unavailable",
        backend: readiness.backendReady ? readiness.mode : "unavailable",
      },
    },
    requestId,
    { status: readiness.ready ? 200 : 503 },
  );
}
