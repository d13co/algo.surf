import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, History, Loader2 } from "lucide-react";
import { Button } from "src/components/v2/ui/button";
import { DataTable } from "src/components/v2/DataTable";
import ListToolbar from "src/components/v2/ListToolbar";
import MultiDateViewer from "src/components/v2/MultiDateViewer";
import { useDateFormat } from "src/contexts/DateFormatContext";
import { useStableHeight } from "src/hooks/useStableHeight";
import { useVersionRows } from "src/hooks/useTimeTravel";
import { VERSIONS_PAGE_SIZE, VersionsOrder } from "src/utils/timeTravel";
import { BaselineContext, ObjectSummary, summarizeObject, Touch, VersionRow } from "src/utils/versionDelta";
import Link from "../Links/Link";
import LinkToBlock from "../Links/LinkToBlock";
import { AgeHeader, ageLabel } from "../Lists/TransactionsList/cells/AgeCell";
import { ChangedKeys, DeltaCell, ObjectLabel, StateHref } from "./VersionChanges";
import VersionDetailsDialog from "./VersionDetailsDialog";

type Row<V> = VersionRow<V> & { index: number; summaries: ObjectSummary[] };

const actionClassName = "border-border text-primary hover:bg-primary/10";

/** A version's time in the chosen date format (see AgeHeader); as a block, a link to it. */
function RoundCell({ round, timestamp }: { round: number; timestamp: number }) {
  const { format } = useDateFormat();
  if (format === "block") return <LinkToBlock id={round} />;
  return <MultiDateViewer timestamp={timestamp} block={round} variant="short" />;
}

/** Toggles a version list between newest first and oldest first. */
export function OrderButton({ order, onChange }: { order: VersionsOrder; onChange: (order: VersionsOrder) => void }) {
  const desc = order === "desc";
  const Icon = desc ? ArrowDownWideNarrow : ArrowUpNarrowWide;
  return (
    <Button
      variant="outline"
      size="sm"
      className={actionClassName}
      onClick={() => onChange(desc ? "asc" : "desc")}
      title={desc ? "Showing newest first. Click to show oldest first" : "Showing oldest first. Click to show newest first"}
    >
      <Icon />
      {desc ? "Newest first" : "Oldest first"}
    </Button>
  );
}

/**
 * A version history, in `order`: what changed at each round, as chips and as
 * a JSON delta, with the whole version a click away. Paging to the last
 * loaded page fetches the next batch.
 */
export default function VersionsList<V extends { round: number; timestamp: number }>({
  ctx,
  versions,
  touchesOf,
  order,
  onOrderChange,
  isLoading,
  error,
  hasMore,
  fetchMore,
  isFetchingMore,
  fetchMoreFailed,
  label,
  stateHref,
  filenamePrefix,
  emptyLabel,
  toolbar,
}: {
  ctx: BaselineContext;
  /** Loaded versions, in `order`. */
  versions: V[];
  /** The objects a version changed; stable. */
  touchesOf: (v: V) => Touch[];
  order: VersionsOrder;
  onOrderChange: (order: VersionsOrder) => void;
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  fetchMore: () => void;
  isFetchingMore: boolean;
  fetchMoreFailed: boolean;
  /** Names each touched object; null where there is only ever one. */
  label: ObjectLabel;
  /** The page showing the state at `round` (see useRound), or the part of it showing `ref`. */
  stateHref: StateHref;
  filenamePrefix: string;
  emptyLabel: string;
  toolbar?: React.ReactNode;
}) {
  const [detailsIndex, setDetailsIndex] = useState<number | null>(null);
  const { format } = useDateFormat();
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: VERSIONS_PAGE_SIZE });

  // Newest first, previous states are read for the rows on the current page
  // and the one open in the dialog - but not while the next batch is on its
  // way (see the effect below), since it supplies most of them.
  const loadedPages = Math.max(1, Math.ceil(versions.length / pagination.pageSize));
  const batchComing =
    hasMore && !fetchMoreFailed && (isFetchingMore || pagination.pageIndex >= loadedPages - 1);
  const shown = useCallback(
    (row: number) =>
      !batchComing &&
      (Math.floor(row / pagination.pageSize) === pagination.pageIndex || row === detailsIndex),
    [batchComing, pagination, detailsIndex],
  );
  const rows = useVersionRows(ctx, versions, touchesOf, hasMore, shown, order);

  const data = useMemo<Row<V>[]>(
    () => rows.map((row, index) => ({ ...row, index, summaries: row.objects.map(summarizeObject) })),
    [rows],
  );

  const columns = useMemo<ColumnDef<Row<V>, any>[]>(
    () => [
      {
        id: "round",
        header: () => <AgeHeader switcherSide="left" />,
        meta: { width: "130px" },
        cell: ({ row }) => <RoundCell round={row.original.round} timestamp={row.original.timestamp} />,
      },
      {
        id: "changed",
        header: "Changed",
        meta: { width: "25%" },
        cell: ({ row }) => <ChangedKeys summaries={row.original.summaries} label={label} />,
      },
      {
        id: "delta",
        header: "Delta",
        cell: ({ row }) => <DeltaCell summaries={row.original.summaries} label={label} />,
      },
      {
        id: "details",
        header: "",
        meta: { width: "215px" },
        cell: ({ row }) => (
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" className={actionClassName} asChild>
              <Link noStyle href={stateHref(row.original.round)} title="This page as it was at this round">
                <History />
                Rewind
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={actionClassName}
              onClick={() => setDetailsIndex(row.original.index)}
            >
              Details
            </Button>
          </div>
        ),
      },
    ],
    [label, stateHref],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => String(row.round),
    autoResetPageIndex: false,
    state: { pagination },
    onPaginationChange: setPagination,
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const currentRowCount = table.getRowModel().rows.length;
  const padCount = hasMore ? pageSize - currentRowCount : 0;

  const { ref: tableRef, style: stableStyle } = useStableHeight(currentRowCount === pageSize);

  // On the last loaded page, fetch the next batch: without it there would be
  // no next page to go to. A failed batch is not retried until the next page
  // change.
  useEffect(() => {
    if (pageIndex >= pageCount - 1 && hasMore && !isFetchingMore && !fetchMoreFailed) {
      fetchMore();
    }
  }, [pageIndex, pageCount, hasMore, isFetchingMore, fetchMoreFailed, fetchMore]);

  function onPageChange(newPage: number) {
    table.setPageIndex(newPage);
    if (fetchMoreFailed && newPage >= pageCount - 1 && hasMore && !isFetchingMore) {
      fetchMore();
    }
  }

  // Keep the table on the page of the version open in the dialog.
  const onDetailsIndexChange = useCallback(
    (index: number | null) => {
      setDetailsIndex(index);
      if (index !== null) table.setPageIndex(Math.floor(index / pageSize));
    },
    [table, pageSize],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <div className="py-6 text-muted-foreground">Version history unavailable: {error.message}</div>;
  }

  return (
    <div>
      <ListToolbar
        className="mt-3"
        pageIndex={pageIndex}
        pageCount={pageCount}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
        onFirst={() => onPageChange(0)}
        onPrev={() => onPageChange(pageIndex - 1)}
        onNext={() => onPageChange(pageIndex + 1)}
        onLast={() => onPageChange(pageCount - 1)}
        loading={isFetchingMore}
      >
        <div className="flex flex-wrap items-center gap-3">
          <OrderButton order={order} onChange={onOrderChange} />
          {toolbar}
        </div>
      </ListToolbar>
      <DataTable
        table={table}
        columns={columns}
        columnLabels={{ round: ageLabel(format), changed: "Changed", delta: "Delta", details: "" }}
        emptyLabel={emptyLabel}
        padCount={padCount}
        isFetchingNextPage={isFetchingMore}
        tableRef={tableRef}
        tableStyle={stableStyle}
        cardsBelow="lg"
      />
      <VersionDetailsDialog
        rows={rows}
        index={detailsIndex}
        onIndexChange={onDetailsIndexChange}
        hasMore={hasMore}
        fetchMore={fetchMore}
        isFetchingMore={isFetchingMore}
        fetchMoreFailed={fetchMoreFailed}
        order={order}
        label={label}
        stateHref={stateHref}
        filenamePrefix={filenamePrefix}
      />
    </div>
  );
}
