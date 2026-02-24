import React from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/v2/ui/table";
import { Button } from "src/components/v2/ui/button";
import { A_BoxName, A_BoxNames } from "src/packages/core-sdk/types";
import MultiFormatViewer from "src/components/v2/MultiFormatViewer";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
} from "lucide-react";

const PAGE_SIZE = 10;

const columns: ColumnDef<A_BoxName, any>[] = [
  {
    id: "name",
    header: "Box name",
    cell: ({ row }) => (
      <MultiFormatViewer view="auto" includeNum="auto" value={row.original.name} />
    ),
  },
];

interface BoxListProps {
  boxNames: A_BoxNames;
  hasMore?: boolean;
  loadMore?: () => void;
  loadingMore?: boolean;
}

function BoxList({
  boxNames = [],
  hasMore = false,
  loadMore,
  loadingMore = false,
}: BoxListProps): JSX.Element {
  const [pageIndex, setPageIndex] = React.useState(0);

  const table = useReactTable({
    data: boxNames,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.name,
    autoResetPageIndex: false,
    state: { pagination: { pageIndex, pageSize: PAGE_SIZE } },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater({ pageIndex, pageSize: PAGE_SIZE }) : updater;
      setPageIndex(next.pageIndex);
    },
  });

  const pageCount = table.getPageCount();

  // Auto-fetch more when approaching the last loaded page
  function handlePageChange(newPage: number) {
    if (hasMore && loadMore && newPage >= pageCount - 2) {
      loadMore();
    }
    setPageIndex(newPage);
  }

  return (
    <div>
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
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="max-w-0 overflow-hidden text-ellipsis">
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                No boxes
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {pageCount > 1 || hasMore ? (
        <div className="flex items-center justify-end gap-2 pt-4">
          {loadingMore ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
          <span className="text-sm text-muted-foreground">
            Page {pageIndex + 1} of {pageCount}{hasMore ? "+" : ""}
          </span>
          <Button
            variant="muted"
            size="icon"
            className="h-8 w-8"
            onClick={() => handlePageChange(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="muted"
            size="icon"
            className="h-8 w-8"
            onClick={() => handlePageChange(pageIndex - 1)}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="muted"
            size="icon"
            className="h-8 w-8"
            onClick={() => handlePageChange(pageIndex + 1)}
            disabled={!table.getCanNextPage() && !hasMore}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {hasMore && loadMore ? (
            <Button
              variant="muted"
              size="sm"
              className="h-8 text-xs"
              onClick={() => loadMore()}
              disabled={loadingMore}
            >
              Load more
            </Button>
          ) : (
            <Button
              variant="muted"
              size="icon"
              className="h-8 w-8"
              onClick={() => handlePageChange(pageCount - 1)}
              disabled={!table.getCanNextPage()}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default BoxList;
