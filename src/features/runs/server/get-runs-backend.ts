import { isMockModeEnabled } from "@/lib/config/mock-mode";
import { createBridgeRunsBackend } from "./bridge-runs-backend";
import { createMockRunsBackend } from "./mock-runs-backend";
import type { RunsBackend } from "./runs-backend";

export function getRunsBackend(): RunsBackend {
  return isMockModeEnabled() ? createMockRunsBackend() : createBridgeRunsBackend();
}
