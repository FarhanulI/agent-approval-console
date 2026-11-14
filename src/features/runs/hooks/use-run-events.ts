"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RunDetail } from "../schemas/run";
import { runsService } from "../services";
import type { RunStreamStatus, RunsService } from "../types";
import { runKeys } from "./use-runs-query";
import {
  hasRunEventGap,
  mergeRunEvents,
  reconcileRunSnapshot,
} from "../utils/run-events";

const terminalStatuses = new Set(["completed", "failed", "cancelled", "rejected"]);

export type RunEventsController = {
  status: RunStreamStatus | "connecting" | "inactive";
  retry: () => void;
};

export function useRunEvents(
  run: RunDetail | undefined,
  service: RunsService = runsService,
): RunEventsController {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<{
    runId: string;
    status: RunStreamStatus;
  }>({ runId: "", status: "reconnecting" });
  const [connectionVersion, setConnectionVersion] = useState(0);
  const lastEventId = useRef<string | undefined>(undefined);
  const lastEventRunId = useRef<string | undefined>(undefined);
  const reconcileBeforeConnect = useRef(false);
  const terminalRetryController = useRef<AbortController | undefined>(undefined);
  const runId = run?.id;
  const active = Boolean(run && !terminalStatuses.has(run.status));

  useEffect(
    () => () => terminalRetryController.current?.abort(),
    [runId],
  );

  const retry = useCallback(() => {
    if (!runId) return;
    if (!active) {
      terminalRetryController.current?.abort();
      const controller = new AbortController();
      terminalRetryController.current = controller;
      setConnection({ runId, status: "recovering" });
      void service
        .getRun(runId, { signal: controller.signal })
        .then((snapshot) => {
          if (controller.signal.aborted) return;
          if (snapshot.id !== runId) {
            setConnection({ runId, status: "recovery-incomplete" });
            return;
          }
          queryClient.setQueryData<RunDetail>(
            runKeys.detail(runId),
            (current) =>
              current ? reconcileRunSnapshot(current, snapshot) : snapshot,
          );
          const reconciled =
            queryClient.getQueryData<RunDetail>(runKeys.detail(runId)) ?? snapshot;
          const status =
            connection.status === "history-unavailable"
              ? "history-unavailable"
              : hasRunEventGap(reconciled.events)
                ? "recovery-incomplete"
                : "connected";
          setConnection({ runId, status });
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setConnection({ runId, status: "recovery-incomplete" });
          }
        });
      return;
    }
    reconcileBeforeConnect.current = true;
    setConnection({ runId, status: "recovering" });
    setConnectionVersion((current) => current + 1);
  }, [active, connection.status, queryClient, runId, service]);

  useEffect(() => {
    if (!runId || !active) return;
    if (lastEventRunId.current !== runId) {
      lastEventRunId.current = runId;
      lastEventId.current = undefined;
    }

    let disposed = false;
    let opened = false;
    let historyUnavailable = false;
    let snapshotRecoveryFailed = false;
    let reconnectAfterRecovery = false;
    let unsubscribe = () => {};
    let reconciliation: Promise<boolean> | undefined;
    const snapshotAbortController = new AbortController();

    const updateStatus = (status: RunStreamStatus) => {
      if (!disposed) setConnection({ runId, status });
    };

    const reconcile = (
      recoveryReason?: "cursor-expired" | "history-unavailable",
    ): Promise<boolean> => {
      if (recoveryReason === "history-unavailable") {
        historyUnavailable = true;
      }
      if (reconciliation) {
        return reconciliation.then((success) => {
          if (success && recoveryReason === "history-unavailable") {
            updateStatus("history-unavailable");
          }
          return success;
        });
      }
      updateStatus("recovering");
      reconciliation = (async () => {
        try {
          const snapshot = await service.getRun(runId, {
            signal: snapshotAbortController.signal,
          });
          if (snapshot.id !== runId) {
            throw new Error("The snapshot belongs to a different run.");
          }
          queryClient.setQueryData<RunDetail>(
            runKeys.detail(runId),
            (current) =>
              current ? reconcileRunSnapshot(current, snapshot) : snapshot,
          );
          const reconciled =
            queryClient.getQueryData<RunDetail>(runKeys.detail(runId)) ?? snapshot;
          snapshotRecoveryFailed = false;
          const lastEvent = [...reconciled.events].sort(
            (left, right) => left.sequence - right.sequence,
          ).at(-1);
          if (lastEvent) lastEventId.current = lastEvent.id;

          if (recoveryReason === "history-unavailable") {
            historyUnavailable = true;
            updateStatus("history-unavailable");
          } else {
            updateStatus(
              hasRunEventGap(reconciled.events)
                ? "recovery-incomplete"
                : "connected",
            );
          }
          return true;
        } catch {
          snapshotRecoveryFailed = true;
          updateStatus("recovery-incomplete");
          return false;
        } finally {
          reconciliation = undefined;
        }
      })();
      return reconciliation;
    };

    const subscribe = () => {
      if (disposed || historyUnavailable) return;
      unsubscribe = service.subscribeEvents(
        runId,
        {
          onEvent(event) {
            if (event.runId !== runId) return;
            lastEventId.current = event.id;
            const updated = queryClient.setQueryData<RunDetail>(
              runKeys.detail(runId),
              (current) => {
                if (!current) return current;
                const merged = mergeRunEvents(current.events, event, runId);
                return { ...current, events: merged.events };
              },
            );
            if (!updated) return;
            if (hasRunEventGap(updated.events)) {
              void reconcile();
            } else if (!historyUnavailable && !snapshotRecoveryFailed) {
              updateStatus("connected");
            }
          },
          onRecovery(signal) {
            if (signal.runId !== runId) return;
            if (signal.reason === "history-unavailable") {
              void reconcile("history-unavailable");
              return;
            }
            reconnectAfterRecovery = true;
            void reconcile("cursor-expired").then((success) => {
              if (!success || disposed || !reconnectAfterRecovery) return;
              reconnectAfterRecovery = false;
              setConnectionVersion((current) => current + 1);
            });
          },
          onOpen() {
            const current = queryClient.getQueryData<RunDetail>(
              runKeys.detail(runId),
            );
            if (opened || (current && hasRunEventGap(current.events))) {
              void reconcile();
            } else {
              updateStatus("connected");
            }
            opened = true;
          },
          onError(status) {
            updateStatus(status);
          },
        },
        { lastEventId: lastEventId.current },
      );
    };

    if (reconcileBeforeConnect.current) {
      reconcileBeforeConnect.current = false;
      void reconcile().then((success) => {
        if (success && !disposed) subscribe();
      });
    } else {
      subscribe();
    }

    return () => {
      disposed = true;
      snapshotAbortController.abort();
      unsubscribe();
    };
  }, [active, connectionVersion, queryClient, runId, service]);

  const status =
    connection.runId !== runId
      ? active
        ? "connecting"
        : "inactive"
      : !active &&
          connection.status !== "history-unavailable" &&
          connection.status !== "recovery-incomplete"
        ? "inactive"
        : connection.status;

  return { status, retry };
}
