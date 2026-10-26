import { isMockModeEnabled } from "@/lib/config/mock-mode";
import type { AuditBackend } from "./audit-backend";
import { createBridgeAuditBackend } from "./bridge-audit-backend";
import { createMockAuditBackend } from "./mock-audit-backend";

/**
 * Mock only when `isMockModeEnabled()`; otherwise the unavailable bridge
 * adapter. No runtime fallback between them.
 */
export function getAuditBackend(): AuditBackend {
  return isMockModeEnabled() ? createMockAuditBackend() : createBridgeAuditBackend();
}
