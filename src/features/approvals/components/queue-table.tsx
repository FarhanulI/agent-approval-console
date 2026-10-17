"use client";

import {
  createColumnHelper,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import Link from "next/link";
import { useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/format-date";
import type { PendingAction } from "../contracts";
import type { ActionSort } from "../types";
import { isSelectable } from "../utils/presentation";
import { sortingStateToSort, sortToSortingState } from "../utils/queue-state";
import { QueuePagination } from "./queue-pagination";
import { RiskBadge, StatusBadge } from "./status-badges";

const features = tableFeatures({
  rowSortingFeature,
  rowSelectionFeature,
  rowPaginationFeature,
});

const columnHelper = createColumnHelper<typeof features, PendingAction>();

function resolve<T>(updater: Updater<T>, current: T): T {
  return typeof updater === "function"
    ? (updater as (old: T) => T)(current)
    : updater;
}

function SelectCheckbox({
  label,
  checked,
  indeterminate = false,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled: boolean;
  onChange: (event: unknown) => void;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="size-4 accent-accent disabled:opacity-40"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      ref={(element) => {
        if (element) element.indeterminate = indeterminate;
      }}
    />
  );
}

const columns = columnHelper.columns([
  columnHelper.display({
    id: "select",
    header: ({ table }) => {
      const meta = table.options.meta as { selectionDisabled?: boolean } | undefined;
      const hasSelectable = table
        .getRowModel()
        .rows.some((row) => row.getCanSelect());
      return (
        <SelectCheckbox
          label="Select all pending actions on this page"
          checked={hasSelectable && table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          disabled={!hasSelectable || Boolean(meta?.selectionDisabled)}
          onChange={table.getToggleAllRowsSelectedHandler()}
        />
      );
    },
    cell: ({ row, table }) => {
      const meta = table.options.meta as { selectionDisabled?: boolean } | undefined;
      const action = row.original;
      return (
        <SelectCheckbox
          label={
            row.getCanSelect()
              ? `Select action: ${action.title} for ${action.targetRecord.label}`
              : `Action not selectable (${action.status}): ${action.title} for ${action.targetRecord.label}`
          }
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect() || Boolean(meta?.selectionDisabled)}
          onChange={row.getToggleSelectedHandler()}
        />
      );
    },
    enableSorting: false,
  }),
  columnHelper.display({
    id: "action",
    header: "Action",
    enableSorting: false,
    cell: ({ row }) => {
      const action = row.original;
      return (
        <div className="min-w-56 space-y-1">
          <Link
            href={`/approvals/${encodeURIComponent(action.id)}`}
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            {action.title}
          </Link>
          <p className="text-meta text-fg-muted">{action.summary}</p>
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "target",
    header: "Target record",
    enableSorting: false,
    cell: ({ row }) => {
      const { targetRecord } = row.original;
      return (
        <div className="min-w-40 space-y-1">
          <p className="text-sm text-fg">{targetRecord.label}</p>
          <p className="text-meta text-fg-muted">
            {targetRecord.entity} ·{" "}
            <code className="font-mono">{targetRecord.recordId}</code>
          </p>
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "agent",
    header: "Agent / run",
    enableSorting: false,
    cell: ({ row }) => {
      const { agent, runId } = row.original;
      return (
        <div className="min-w-36 space-y-1">
          <p className="text-sm text-fg">{agent?.name ?? "Unknown agent"}</p>
          <p className="text-meta text-fg-muted">
            {runId ? (
              <code className="font-mono">{runId}</code>
            ) : (
              "No run linked"
            )}
          </p>
        </div>
      );
    },
  }),
  columnHelper.accessor("risk", {
    id: "risk",
    header: "Risk",
    enableSorting: true,
    cell: ({ cell }) => <RiskBadge risk={cell.getValue()} />,
  }),
  columnHelper.accessor("status", {
    id: "status",
    header: "Status",
    enableSorting: false,
    cell: ({ cell }) => <StatusBadge status={cell.getValue()} />,
  }),
  columnHelper.accessor("createdAt", {
    id: "createdAt",
    header: "Created",
    enableSorting: true,
    cell: ({ cell }) => {
      const iso = cell.getValue();
      return (
        <time dateTime={iso} title={iso} className="whitespace-nowrap text-sm">
          {formatDateTime(iso)}
        </time>
      );
    },
  }),
]);

export type QueueTableProps = {
  actions: readonly PendingAction[];
  sort: ActionSort;
  onSortChange: (sort: ActionSort) => void;
  rowSelection: RowSelectionState;
  onRowSelectionChange: (selection: RowSelectionState) => void;
  /** Disables selection, e.g. while stale placeholder data is displayed. */
  selectionDisabled: boolean;
  /** 1-based page and totals exactly as returned by the server. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** True while the displayed rows do not match the active query. */
  stale: boolean;
};

export function QueueTable({
  actions,
  sort,
  onSortChange,
  rowSelection,
  onRowSelectionChange,
  selectionDisabled,
  page,
  pageSize,
  total,
  onPageChange,
  stale,
}: QueueTableProps) {
  const sorting = useMemo(() => sortToSortingState(sort), [sort]);
  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex: page - 1, pageSize }),
    [page, pageSize],
  );

  const table = useTable({
    features,
    columns,
    data: actions as PendingAction[],
    getRowId: (action) => action.id,
    state: { sorting, rowSelection, pagination },
    meta: { selectionDisabled },
    manualSorting: true,
    manualPagination: true,
    rowCount: total,
    enableSortingRemoval: false,
    enableMultiSort: false,
    enableRowSelection: (row) => isSelectable(row.original.status),
    onSortingChange: (updater: Updater<SortingState>) => {
      const next = sortingStateToSort(resolve(updater, sorting));
      if (next) onSortChange(next);
    },
    onRowSelectionChange: (updater: Updater<RowSelectionState>) =>
      onRowSelectionChange(resolve(updater, rowSelection)),
    onPaginationChange: (updater: Updater<PaginationState>) =>
      onPageChange(resolve(updater, pagination).pageIndex + 1),
  });

  return (
    <div className="space-y-3">
      <div
        role="region"
        aria-label="Pending actions table"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-line bg-surface"
      >
        <table
          className={cn(
            "w-full min-w-[56rem] border-collapse text-left",
            stale && "opacity-60",
          )}
          aria-busy={stale || undefined}
        >
          <caption className="sr-only">
            Pending actions, sorted by{" "}
            {sort.field === "risk" ? "risk" : "created date"}{" "}
            {sort.direction === "asc" ? "ascending" : "descending"}
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
          <tbody className="divide-y divide-line">
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={cn(row.getIsSelected() && "bg-accent-soft")}
              >
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-top">
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <QueuePagination
        page={page}
        pageCount={table.getPageCount()}
        total={total}
        canPrevious={table.getCanPreviousPage()}
        canNext={table.getCanNextPage()}
        onPrevious={() => table.previousPage()}
        onNext={() => table.nextPage()}
        disabled={stale}
      />
    </div>
  );
}
