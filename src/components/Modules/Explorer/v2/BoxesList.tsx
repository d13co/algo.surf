import React, { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import { Button } from "src/components/v2/ui/button";
import { A_BoxName, A_BoxNames } from "src/packages/core-sdk/types";
import MultiFormatViewer from "src/components/v2/MultiFormatViewer";
import { Loader2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "src/components/v2/DataTable";
import ListToolbar from "src/components/v2/ListToolbar";

const PAGE_SIZE = 10;

const columnLabels: Record<string, string> = {
  name: "Box name",
  view: "",
};

interface BoxListProps {
  appId: number;
  boxNames: A_BoxNames;
  hasMore?: boolean;
  loadMore?: () => void;
  loadingMore?: boolean;
  children?: React.ReactNode;
  searchLoading?: boolean;
  searchProgress?: string;
  onCancelSearch?: () => void;
}

function BoxList({
  appId,
  boxNames = [],
  hasMore = false,
  loadMore,
  loadingMore = false,
  children,
  searchLoading = false,
  searchProgress,
  onCancelSearch,
}: BoxListProps): JSX.Element {
  const navigate = useNavigate();

  const columns: ColumnDef<A_BoxName, any>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Box name",
        cell: ({ row }) => (
          <MultiFormatViewer view="auto" includeNum="auto" value={row.original.name} />
        ),
      },
      {
        id: "view",
        header: "",
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              variant="muted"
              className="h-7 px-2.5 text-xs -my-1 border-primary text-primary hover:bg-primary hover:text-background"
              onClick={() =>
                navigate(
                  `/application/${appId}/boxes/${encodeURIComponent(row.original.name)}`
                )
              }
            >
              View
            </Button>
          </div>
        ),
      },
    ],
    [appId, navigate],
  );

  const table = useReactTable({
    data: boxNames,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.name,
    autoResetPageIndex: false,
    initialState: {
      pagination: { pageSize: PAGE_SIZE },
    },
  });

  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();

  function onPageChange(newPage: number) {
    if (hasMore && loadMore && newPage >= pageCount - 2) {
      loadMore();
    }
    table.setPageIndex(newPage);
  }

  return (
    <div>
      <ListToolbar
        className="mt-3"
        pageIndex={pageIndex}
        pageCount={pageCount}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage() || hasMore}
        onFirst={() => onPageChange(0)}
        onPrev={() => onPageChange(pageIndex - 1)}
        onNext={() => onPageChange(pageIndex + 1)}
        onLast={() => onPageChange(pageCount - 1)}
        loading={loadingMore}
      >
        {children}
      </ListToolbar>
      {searchLoading && (
        <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{searchProgress || "Searching..."}</span>
          {onCancelSearch && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full"
              onClick={onCancelSearch}
              title="Cancel search"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
      <DataTable
        table={table}
        columns={columns}
        columnLabels={columnLabels}
        emptyLabel={searchLoading ? "Searching..." : "No boxes"}
        mobileCellItemsCenter
      />
    </div>
  );
}

export default BoxList;
