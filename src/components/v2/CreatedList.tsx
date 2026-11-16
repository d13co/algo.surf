import { useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import ListToolbar from "src/components/v2/ListToolbar";
import ListOrderToggle, { useListOrder } from "src/components/v2/ListOrderToggle";
import { DataTable } from "src/components/v2/DataTable";
import { useStableHeight } from "src/hooks/useStableHeight";
import { useRound } from "src/hooks/useRound";
import { FetchAfter, useCreatedList } from "src/hooks/useCreatedList";

/** A stable empty list while loading, so the table keeps its rows */
const noItems: never[] = [];

/**
 * The assets or applications created on this network, oldest or latest first
 * (`?order=latest`), ten to a table page.
 */
export default function CreatedList<T>({
  kind,
  columns,
  columnLabels,
  pageSize,
  fetchAfter,
  idOf,
}: {
  kind: "assets" | "applications";
  columns: ColumnDef<T, any>[];
  columnLabels: Record<string, string>;
  /** How many the indexer gives per oldest-first page, and the least per latest-first one */
  pageSize: number;
  fetchAfter: FetchAfter<T>;
  idOf: (item: T) => number;
}): JSX.Element {
  const [order, setOrder] = useListOrder();
  const { round } = useRound();
  const { items, fetchNextPage, hasNextPage, isFetchingNextPage, error, reload, reloading } =
    useCreatedList({ kind, order, round, pageSize, fetchAfter, idOf });

  const table = useReactTable<T>({
    data: items ?? noItems,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => String(idOf(row)),
    autoResetPageIndex: false,
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  const { pageIndex, pageSize: rowsPerPage } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const currentRowCount = table.getRowModel().rows.length;
  const padCount = hasNextPage ? rowsPerPage - currentRowCount : 0;

  // Another order or round is another list: start it at its first page
  useEffect(() => table.setPageIndex(0), [order, round, table]);

  const { ref: tableRef, style: stableStyle } = useStableHeight(currentRowCount === rowsPerPage);

  function onPageChange(newPage: number) {
    table.setPageIndex(newPage);
    // Not while reloading: the reload replaces the pages
    if (newPage >= pageCount - 1 && hasNextPage && !isFetchingNextPage && !reloading) {
      fetchNextPage();
    }
  }

  return (
    <div>
      <ListToolbar
        pageIndex={pageIndex}
        pageCount={pageCount}
        hasMore={hasNextPage}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
        onFirst={() => onPageChange(0)}
        onPrev={() => onPageChange(pageIndex - 1)}
        onNext={() => onPageChange(pageIndex + 1)}
        onLast={() => onPageChange(pageCount - 1)}
        loading={isFetchingNextPage}
      >
        <ListOrderToggle
          order={order}
          onChange={setOrder}
          onReload={() => {
            reload().then((replaced) => replaced && table.setPageIndex(0));
          }}
          reloading={reloading}
        />
      </ListToolbar>

      {items ? (
        <>
          <DataTable
            table={table}
            columns={columns}
            columnLabels={columnLabels}
            emptyLabel={`No ${kind}`}
            padCount={padCount}
            isFetchingNextPage={isFetchingNextPage}
            tableRef={tableRef}
            tableStyle={stableStyle}
          />
          {/* A later page that failed: the rows so far stay */}
          {error ? (
            <div className="mt-3 text-sm text-red-400">{(error as Error).message}</div>
          ) : null}
        </>
      ) : error ? (
        <div className="py-16 text-center text-red-400">{(error as Error).message}</div>
      ) : (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{order === "latest" ? `Finding the latest ${kind}...` : `Loading ${kind}...`}</span>
        </div>
      )}
    </div>
  );
}
