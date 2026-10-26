import { BackendError, type ActionsBackend } from "./actions-backend";

/**
 * Placeholder for the real `erp-mcp-bridge` integration. It performs no
 * network I/O. Before it can be implemented the following must be verified
 * with the bridge owners (see docs/modules-spec/module-06-auth-authorization.md):
 * how the BFF authenticates to the bridge, how the end-user actor and tenant
 * are propagated and enforced, the actual read/decision endpoints, atomic
 * status/`recordVersion` transitions, idempotency semantics, and error codes.
 */
export function createBridgeBackend(): ActionsBackend {
  const unavailable = () =>
    Promise.reject(
      new BackendError(
        "unavailable",
        "No verified backend contract is configured for this environment.",
      ),
    );
  return {
    kind: "bridge",
    listActions: unavailable,
    getAction: unavailable,
    findRecordedDecision: unavailable,
    decide: unavailable,
  };
}
