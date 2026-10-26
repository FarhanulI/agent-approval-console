import { BackendError } from "@/features/approvals/server/actions-backend";
import type { AuditBackend } from "./audit-backend";

/**
 * Placeholder for the real `erp-mcp-bridge` audit integration. It performs no
 * network I/O and fabricates nothing. Required before implementing: confirmed
 * audit read/write endpoints, how tenant scoping and the end-user actor are
 * enforced, durability/immutability guarantees, event taxonomy and ordering,
 * and whether decision + audit are recorded atomically.
 */
export function createBridgeAuditBackend(): AuditBackend {
  const unavailable = () =>
    Promise.reject(
      new BackendError(
        "unavailable",
        "No verified audit contract is configured for this environment.",
      ),
    );
  return { kind: "bridge", record: unavailable, list: unavailable, get: unavailable };
}
