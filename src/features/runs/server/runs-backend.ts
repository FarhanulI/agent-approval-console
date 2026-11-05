import type { Principal } from "@/lib/auth/principal";
import type { RunDetail, RunEvent, RunSummary } from "../schemas/run";

export type RunContext = {
  requestId: string;
  principal: Principal;
};

/** Tenant membership is server-only and is never part of a browser DTO. */
export type StoredRun = {
  tenantId: string;
  detail: RunDetail;
};

export type RunListEntry = {
  tenantId: string;
  summary: RunSummary;
};

export type RunEventsResult = {
  tenantId: string;
  events: RunEvent[];
};

export interface RunsBackend {
  readonly kind: "mock" | "bridge";
  list(ctx: RunContext): Promise<RunListEntry[]>;
  get(ctx: RunContext, runId: string): Promise<StoredRun | undefined>;
  getEvents(
    ctx: RunContext,
    runId: string,
    lastEventId?: string,
  ): Promise<RunEventsResult | undefined>;
}
