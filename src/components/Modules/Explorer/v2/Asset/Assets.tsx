import { useMemo } from "react";
import { useAssets } from "src/hooks/useAssets";
import { A_Asset } from "src/packages/core-sdk/types";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  Row,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/v2/ui/table";
import LinkToAsset from "../Links/LinkToAsset";
import LinkToAccount from "../Links/LinkToAccount";
import { Loader2 } from "lucide-react";
import ListToolbar from "src/components/v2/ListToolbar";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import { SkeletonRows, SkeletonCards } from "src/components/v2/ui/table-skeleton";
import { useStableHeight } from "src/hooks/useStableHeight";

const columns: ColumnDef<A_Asset, any>[] = [
  {
    id: "name",
    header: "Name",
    cell: ({ row }) => (
      <LinkToAsset id={row.original.index} name={row.original.params.name} />
    ),
  },
  {
    id: "index",
    header: "ID",
    cell: ({ row }) => <LinkToAsset id={row.original.index} />,
  },
  {
    id: "unit",
    header: "Unit",
    cell: ({ row }) => <span>{row.original.params["unit-name"]}</span>,
  },
  {
    id: "url",
    header: "Url",
    cell: ({ row }) => {
      const url = row.original.params.url;
      return url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline truncate block"
        >
          {url}
        </a>
      ) : (
        <span className="text-muted-foreground">--None--</span>
      );
    },
  },
  {
    id: "creator",
    header: "Creator",
    cell: ({ row }) => (
      <LinkToAccount
        copy="left"
        copySize="s"
        address={row.original.params.creator}
        strip={30}
      />
    ),
  },
];

const columnLabels: Record<string, string> = {
  name: "Name",
  index: "ID",
  unit: "Unit",
  url: "Url",
  creator: "Creator",
};

function AssetCard({ row }: { row: Row<A_Asset> }) {
  const visibleCells = row.getVisibleCells();
  return (
    <div className="rounded-lg border border-muted bg-card p-3 space-y-2 text-sm">
      {visibleCells.map((cell) => (
        <div key={cell.id} className="flex justify-between gap-2">
          <span className="text-muted-foreground shrink-0">
            {columnLabels[cell.column.id] || cell.column.id}
          </span>
          <span className="text-right min-w-0 overflow-hidden max-w-[80%]">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </span>
        </div>
      ))}
    </div>
  );
}

function Assets(): JSX.Element {
  useTitle("Assets");

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useAssets();

  const assets = useMemo(
    () => data?.pages.flatMap((p) => p.assets) ?? [],
    [data],
  );

  const initialLoading = !data;

  const table = useReactTable({
    data: assets,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => String(row.index),
    autoResetPageIndex: false,
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const currentRowCount = table.getRowModel().rows.length;
  const padCount = hasNextPage ? pageSize - currentRowCount : 0;

  const { ref: tableRef, style: stableStyle } = useStableHeight(currentRowCount === pageSize);

  function onPageChange(newPage: number) {
    table.setPageIndex(newPage);
    if (newPage >= pageCount - 1 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading assets...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Pagination */}
      <ListToolbar
        pageIndex={pageIndex}
        pageCount={pageCount}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
        onFirst={() => onPageChange(0)}
        onPrev={() => onPageChange(pageIndex - 1)}
        onNext={() => onPageChange(pageIndex + 1)}
        onLast={() => onPageChange(pageCount - 1)}
        loading={isFetchingNextPage}
      />

      {/* Desktop table */}
      <div ref={tableRef} style={stableStyle} className="hidden md:block">
        <Table className="table-fixed">
          <TableHeader className="[&_tr]:border-primary">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              <>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="max-w-0">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {padCount > 0 ? <SkeletonRows rows={padCount} columns={columns.length} animate={isFetchingNextPage} /> : null}
              </>
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No assets
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {table.getRowModel().rows.length > 0 ? (
          <>
            {table.getRowModel().rows.map((row) => (
              <AssetCard key={row.id} row={row} />
            ))}
            {padCount > 0 ? <SkeletonCards rows={padCount} fields={columns.length} animate={isFetchingNextPage} /> : null}
          </>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            No assets
          </div>
        )}
      </div>
    </div>
  );
}

export default Assets;
