"use client";

import {
  createColumnHelper,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type PaginationState,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/format-date";
import type { AuditEventDto } from "../schemas/audit-event";
import type { AuditSortDirection } from "../schemas/audit-query";
import { isLinkableActionId } from "../utils/presentation";
import { EventTypeBadge, OutcomeBadge } from "./audit-badges";

const features = tableFeatures({ rowSortingFeature, rowPaginationFeature });
const columnHelper = createColumnHelper<typeof features, AuditEventDto>();

function resolve<T>(updater: Updater<T>, current: T): T {
  return typeof updater === "function" ? (updater as (old: T) => T)(current) : updater;
}

export type AuditTableProps = {
  events: readonly AuditEventDto[];
  direction: AuditSortDirection;
  onDirectionChange: (direction: AuditSortDirection) => void;
  /** 1-based page and totals exactly as returned by the server. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onOpenEvent: (eventId: string) => void;
  /** True while the displayed rows do not match the active query. */
  stale: boolean;
};

/**
 * Event table. All cell content is rendered as React text (never as HTML), and
 * the only link is to an action detail page for a well-formed action id; that
 * page performs its own authorization, so a link is never proof of access.
 */
export function AuditTable({
  events,
  direction,
  onDirectionChange,
  page,
  pageSize,
  total,
  onPageChange,
  onOpenEvent,
  stale,
}: AuditTableProps) {
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("occurredAt", {
          id: "occurredAt",
          header: "Time",
          enableSorting: true,
          cell: ({ cell }) => {
            const iso = cell.getValue();
            return (
              <time dateTime={iso} title={iso} className="whitespace-nowrap text-sm">
                {formatDateTime(iso, "UTC")} UTC
              </time>
            );
          },
        }),
        columnHelper.display({
          id: "event",
          header: "Event",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="min-w-56 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <EventTypeBadge eventType={row.original.eventType} />
                <OutcomeBadge outcome={row.original.outcome} />
              </div>
              <p className="text-sm text-fg">{row.original.summary}</p>
            </div>
          ),
        }),
        columnHelper.display({
          id: "actor",
          header: "Actor",
          enableSorting: false,
          cell: ({ row }) => {
            const { actorType, actorId } = row.original;
            return (
              <div className="min-w-32 space-y-1 text-sm">
                <p className="capitalize text-fg">{actorType}</p>
                <p className="text-meta text-fg-muted">
                  {actorId ? <code className="font-mono">{actorId}</code> : "No actor id"}
                </p>
              </div>
            );
          },
        }),
        columnHelper.display({
          id: "reference",
          header: "Action",
          enableSorting: false,
          cell: ({ row }) => {
            const { actionId } = row.original;
            if (!actionId) return <span className="text-sm text-fg-muted">—</span>;
            return isLinkableActionId(actionId) ? (
              <Link
                href={`/approvals/${encodeURIComponent(actionId)}`}
                className="font-mono text-sm text-accent underline-offset-2 hover:underline"
              >
                {actionId}
              </Link>
            ) : (
              <code className="font-mono text-sm">{actionId}</code>
            );
          },
        }),
        columnHelper.display({
          id: "details",
          header: () => <span className="sr-only">Details</span>,
          enableSorting: false,
          cell: ({ row }) => (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onOpenEvent(row.original.id)}
              aria-label={`View details for event ${row.original.id}`}
            >
              Details
            </Button>
          ),
        }),
      ]),
    [onOpenEvent],
  );

  const sorting = useMemo<SortingState>(
    () => [{ id: "occurredAt", desc: direction === "desc" }],
    [direction],
  );
  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex: page - 1, pageSize }),
    [page, pageSize],
  );

  const table = useTable({
    features,
    columns,
    data: events as AuditEventDto[],
    getRowId: (event) => event.id,
    state: { sorting, pagination },
    manualSorting: true,
    manualPagination: true,
    rowCount: total,
    enableSortingRemoval: false,
    enableMultiSort: false,
    onSortingChange: (updater: Updater<SortingState>) => {
      const first = resolve(updater, sorting)[0];
      if (first) onDirectionChange(first.desc ? "desc" : "asc");
    },
    onPaginationChange: (updater: Updater<PaginationState>) =>
      onPageChange(resolve(updater, pagination).pageIndex + 1),
  });

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <div
        role="region"
        aria-label="Audit events table"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-line bg-surface"
      >
        <table
          className={cn("w-full min-w-[52rem] border-collapse text-left", stale && "opacity-60")}
          aria-busy={stale || undefined}
        >
          <caption className="sr-only">
            Audit events, sorted by time {direction === "asc" ? "oldest first" : "newest first"}
          </caption>
          <thead className="border-b border-line bg-surface-muted text-meta text-fg-muted">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const sortable = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className="px-4 py-3 font-medium"
                      aria-sort={
                        sortable
                          ? sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : "none"
                          : undefined
                      }
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 rounded-sm font-medium hover:text-fg"
                        >
                          <table.FlexRender header={header} />
                          <span aria-hidden="true">
                            {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "↕"}
                          </span>
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-b-0 align-top">
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          Page {page} of {pageCount} · {total} {total === 1 ? "event" : "events"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={stale || page <= 1}
            aria-label="Previous page"
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={stale || page >= pageCount}
            aria-label="Next page"
          >
            Next
          </Button>
        </div>
      </nav>
    </div>
  );
}
