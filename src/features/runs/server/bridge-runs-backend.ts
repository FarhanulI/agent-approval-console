import { BackendError } from "@/features/approvals/server/actions-backend";
import type { RunsBackend } from "./runs-backend";

/**
 * No verified `erp-mcp-bridge` run or event-stream contract exists. This
 * adapter intentionally performs no network I/O and never falls back to mock.
 */
export function createBridgeRunsBackend(): RunsBackend {
  const unavailable = () =>
    Promise.reject(
      new BackendError(
        "unavailable",
        "No verified run backend contract is configured for this environment.",
      ),
    );
  return {
    kind: "bridge",
    list: unavailable,
    get: unavailable,
    getEvents: unavailable,
  };
}
