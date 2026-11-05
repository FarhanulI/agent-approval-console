"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { runsService } from "../services";
import type { RunsService } from "../types";

export const runKeys = {
  all: ["runs"] as const,
  lists: () => [...runKeys.all, "list"] as const,
  list: () => [...runKeys.lists()] as const,
  details: () => [...runKeys.all, "detail"] as const,
  detail: (runId: string) => [...runKeys.details(), runId] as const,
};

export function useRunsQuery(service: RunsService = runsService) {
  return useQuery({
    queryKey: runKeys.list(),
    queryFn: ({ signal }) => service.listRuns({ signal }),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useRunQuery(
  runId: string,
  service: RunsService = runsService,
) {
  return useQuery({
    queryKey: runKeys.detail(runId),
    queryFn: ({ signal }) => service.getRun(runId, { signal }),
    retry: false,
    refetchOnMount: "always",
  });
}
