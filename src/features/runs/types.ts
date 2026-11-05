import type { RunDetail, RunEvent, RunListResponse, RunSummary } from "./schemas/run";

export type RunReadOptions = { signal?: AbortSignal };

export type RunStreamStatus = "connected" | "reconnecting" | "disconnected";

export type RunEventHandlers = {
  onEvent: (event: RunEvent) => void;
  onOpen: () => void;
  onError: (status: Exclude<RunStreamStatus, "connected">) => void;
};

/** The UI depends on this port, not on HTTP or EventSource details. */
export interface RunsService {
  listRuns(options?: RunReadOptions): Promise<RunListResponse>;
  getRun(runId: string, options?: RunReadOptions): Promise<RunDetail>;
  subscribeEvents(runId: string, handlers: RunEventHandlers): () => void;
}

export type RunStatusLabel = Record<RunSummary["status"], string>;

export type MergeRunEventsResult = {
  events: RunEvent[];
  hasGap: boolean;
};
