import type {
  RunDetail,
  RunEvent,
  RunListResponse,
  RunStreamRecovery,
  RunSummary,
} from "./schemas/run";

export type RunReadOptions = { signal?: AbortSignal };

export type RunStreamStatus =
  | "connected"
  | "reconnecting"
  | "recovering"
  | "recovery-incomplete"
  | "history-unavailable"
  | "disconnected";

export type RunEventHandlers = {
  onEvent: (event: RunEvent) => void;
  onRecovery: (signal: RunStreamRecovery) => void;
  onOpen: () => void;
  onError: (status: "reconnecting" | "disconnected") => void;
};

/** The UI depends on this port, not on HTTP or EventSource details. */
export interface RunsService {
  listRuns(options?: RunReadOptions): Promise<RunListResponse>;
  getRun(runId: string, options?: RunReadOptions): Promise<RunDetail>;
  subscribeEvents(
    runId: string,
    handlers: RunEventHandlers,
    options?: { lastEventId?: string },
  ): () => void;
};

export type RunStatusLabel = Record<RunSummary["status"], string>;

export type MergeRunEventsResult = {
  events: RunEvent[];
  hasGap: boolean;
  added: boolean;
};
