import { isMockModeEnabled } from "@/lib/config/mock-mode";
import type { ActionsBackend } from "./actions-backend";
import { createBridgeBackend } from "./bridge-backend";
import { createMockBackend } from "./mock-backend";

/**
 * Selects the backend. Mock only when `isMockModeEnabled()`; otherwise the
 * unavailable bridge adapter. There is no fallback between them at runtime.
 */
export function getBackend(): ActionsBackend {
  return isMockModeEnabled() ? createMockBackend() : createBridgeBackend();
}
