import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useVersionFilterHref } from "src/hooks/useVersionFilter";
import { VERSIONS_PAGE_SIZE, VersionsOrder } from "src/utils/timeTravel";
import { BaselineContext, FieldPath, ObjectSummary, summarizeObject, Touch, VersionRow } from "src/utils/versionDelta";
import { VersionFilter, versionMatches } from "src/utils/versionFilter";
import Link from "../Links/Link";
import LinkToBlock from "../Links/LinkToBlock";
import { AgeHeader, ageLabel } from "../Lists/TransactionsList/cells/AgeCell";
import { ActiveFilter, ChangedKeys, DeltaCell, FieldHref, ObjectLabel, StateHref } from "./VersionChanges";
import VersionDetailsDialog from "./VersionDetailsDialog";

export type SummarizedRow<V> = VersionRow<V> & { summaries: ObjectSummary[] };

type Row<V> = SummarizedRow<V> & { index: number };

/** Versions a filtered list reads on its own before waiting to be asked for more. */
const SCAN_STEP = 500;

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
 * loaded page fetches the next batch. With a `filter`, only the versions that
 * changed what it names, and only those changes; the chips and delta keys
 * link to the list filtered to them.
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
  filter,
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
  /**
   * From the URL (useVersionFilter). `touchesOf` gives only its object's
   * touches, so a version needs at most one previous state read.
   */
  filter?: VersionFilter;
}) {
  const [detailsIndex, setDetailsIndex] = useState<number | null>(null);
  const { format } = useDateFormat();
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: VERSIONS_PAGE_SIZE });

  // Filtered, a batch can hold few matches or none: fetch on while the page
  // is short, up to SCAN_STEP versions past where the reader last asked for more.
  const [scanUntil, setScanUntil] = useState(() => versions.length + SCAN_STEP);
  const scanPaused = !!filter && versions.length >= scanUntil;
  // Searching on lifts the limit, and retries a failed batch (the effect below does not).
  const searchOn = useCallback(() => {
    setScanUntil(versions.length + SCAN_STEP);
    if (fetchMoreFailed && !isFetchingMore) fetchMore();
  }, [versions.length, fetchMoreFailed, isFetchingMore, fetchMore]);

  // Newest first, previous states are read for the rows on the current page
  // and the one open in the dialog - but not while the next batch is on its
  // way (see the effect below), since it supplies most of them. Filtered, the
  // one there can be (of the oldest loaded version) holds back only the rows
  // after it, so it is read only once no more batches are coming.
  const loadedPages = Math.max(1, Math.ceil(versions.length / pagination.pageSize));
  const batchComing =
    hasMore && !fetchMoreFailed && (isFetchingMore || pagination.pageIndex >= loadedPages - 1);
  const moreComing = hasMore && !fetchMoreFailed && !scanPaused;
  const shown = useCallback(
    (row: number) =>
      filter
        ? !moreComing
        : !batchComing &&
          (Math.floor(row / pagination.pageSize) === pagination.pageIndex || row === detailsIndex),
    [filter, moreComing, batchComing, pagination, detailsIndex],
  );
  const rows = useVersionRows(ctx, versions, touchesOf, hasMore, shown, order);

  const data = useMemo<Row<V>[]>(() => {
    const out: Row<V>[] = [];
    for (const row of rows) {
      const summaries = row.objects.map((o) => summarizeObject(o, filter?.fields));
      if (filter) {
        const match = versionMatches(summaries, filter.fields);
        // Until its previous state is in, the versions after it wait too.
        if (match === undefined) break;
        if (!match) continue;
      }
      out.push({ ...row, index: out.length, summaries });
    }
    return out;
  }, [rows, filter]);

  const filterHref = useVersionFilterHref();
  const fieldHref = useCallback<FieldHref>(
    (key: string, path?: FieldPath) => filterHref({ object: label ? key : undefined, fields: path ? [path] : [] }),
    [filterHref, label],
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
        cell: ({ row }) => <ChangedKeys summaries={row.original.summaries} label={label} fieldHref={fieldHref} />,
      },
      {
        id: "delta",
        header: "Delta",
        cell: ({ row }) => <DeltaCell summaries={row.original.summaries} label={label} fieldHref={fieldHref} />,
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
    [label, stateHref, fieldHref],
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
    if (pageIndex >= pageCount - 1 && hasMore && !isFetchingMore && !fetchMoreFailed && !scanPaused) {
      fetchMore();
    }
  }, [pageIndex, pageCount, hasMore, isFetchingMore, fetchMoreFailed, scanPaused, fetchMore]);

  function onPageChange(newPage: number) {
    table.setPageIndex(newPage);
    if (newPage >= pageCount - 1) {
      if (filter) setScanUntil((until) => Math.max(until, versions.length + SCAN_STEP));
      if (fetchMoreFailed && hasMore && !isFetchingMore) fetchMore();
    }
  }

  // The dialog stepping past the last match asks for more: past the scan
  // limit, that lifts it, and the effect above fetches.
  const fetchMoreForDialog = useCallback(() => {
    if (scanPaused || fetchMoreFailed) searchOn();
    else fetchMore();
  }, [scanPaused, fetchMoreFailed, searchOn, fetchMore]);

  // Filtered from a link (each filter mounts a new list), bring the list into
  // view where it is off screen: above it, or low on it.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!filter || !el) return;
    const { top } = el.getBoundingClientRect();
    if (top < 0 || top > window.innerHeight * 0.75) el.scrollIntoView({ behavior: "smooth", block: "start" });
    // On mount only.
  }, []);

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
      <div ref={rootRef} className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div ref={rootRef} className="py-6 text-muted-foreground">
        Version history unavailable: {error.message}
      </div>
    );
  }

  return (
    <div ref={rootRef}>
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
          {filter ? (
            <>
              <ActiveFilter filter={filter} label={label} filterHref={filterHref} />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {data.length.toLocaleString()} of {versions.length.toLocaleString()}
                {hasMore ? "+" : ""} {versions.length === 1 && !hasMore ? "version" : "versions"}
              </span>
              {(scanPaused || fetchMoreFailed) && hasMore && !isFetchingMore ? (
                <Button variant="outline" size="sm" className={actionClassName} onClick={searchOn}>
                  {fetchMoreFailed ? "Retry" : "Keep searching"}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </ListToolbar>
      <DataTable
        table={table}
        columns={columns}
        columnLabels={{ round: ageLabel(format), changed: "Changed", delta: "Delta", details: "" }}
        emptyLabel={
          !filter
            ? emptyLabel
            : hasMore && fetchMoreFailed
              ? "Could not load more versions"
              : moreComing
                ? "Searching…"
                : hasMore
                  ? `None in the ${versions.length.toLocaleString()} versions searched so far`
                  : "No versions changed this"
        }
        padCount={padCount}
        isFetchingNextPage={isFetchingMore}
        tableRef={tableRef}
        tableStyle={stableStyle}
        cardsBelow="lg"
      />
      <VersionDetailsDialog
        rows={data}
        index={detailsIndex}
        onIndexChange={onDetailsIndexChange}
        hasMore={hasMore}
        fetchMore={fetchMoreForDialog}
        searchPaused={scanPaused && hasMore && !isFetchingMore}
        isFetchingMore={isFetchingMore}
        fetchMoreFailed={fetchMoreFailed}
        order={order}
        label={label}
        stateHref={stateHref}
        fieldHref={fieldHref}
        filenamePrefix={filenamePrefix}
      />
    </div>
  );
}
