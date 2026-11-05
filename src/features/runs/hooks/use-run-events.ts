"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RunDetail } from "../schemas/run";
import { runsService } from "../services";
import type { RunStreamStatus, RunsService } from "../types";
import { runKeys } from "./use-runs-query";
import { hasRunEventGap, mergeRunEvents } from "../utils/run-events";

const terminalStatuses = new Set(["completed", "failed", "cancelled", "rejected"]);

export function useRunEvents(
  run: RunDetail | undefined,
  service: RunsService = runsService,
): RunStreamStatus | "connecting" | "inactive" {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<{
    runId: string;
    status: RunStreamStatus;
  }>({ runId: "", status: "reconnecting" });
  const runId = run?.id;
  const active = Boolean(run && !terminalStatuses.has(run.status));

  useEffect(() => {
    if (!runId || !active) {
      return;
    }

    let opened = false;
    const unsubscribe = service.subscribeEvents(runId, {
      onEvent(event) {
        const result = queryClient.setQueryData<RunDetail>(
          runKeys.detail(runId),
          (current) => {
            if (!current) return current;
            const merged = mergeRunEvents(current.events, event);
            return { ...current, events: merged.events };
          },
        );
        if (result && hasRunEventGap(result.events)) {
          void queryClient.invalidateQueries({ queryKey: runKeys.detail(runId) });
        }
      },
      onOpen() {
        setConnection({ runId, status: "connected" });
        if (opened) {
          void queryClient.invalidateQueries({ queryKey: runKeys.detail(runId) });
        }
        opened = true;
      },
      onError(nextStatus) {
        setConnection({ runId, status: nextStatus });
      },
    });

    return () => {
      unsubscribe();
    };
  }, [active, queryClient, runId, service]);

  if (!active) return "inactive";
  if (connection.runId !== runId) return "connecting";
  return connection.status;
}
