import { useMemo } from "react";
import { CoreApplication } from "src/packages/core-sdk/classes/core/CoreApplication";
import { A_Application } from "src/packages/core-sdk/types";
import { A_GlobalStateDecrypted } from "src/packages/core-sdk/types";
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
import { Button } from "src/components/v2/ui/button";
import MultiFormatViewer from "src/components/v2/MultiFormatViewer";
import NumberFormatCopy from "src/components/v2/NumberFormatCopy";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

const columns: ColumnDef<A_GlobalStateDecrypted, any>[] = [
  {
    id: "type",
    header: "Type",
    size: 60,
    minSize: 60,
    maxSize: 60,
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.type === "bytes" ? "byte" : "uint"}
      </span>
    ),
  },
  {
    id: "key",
    header: "Key",
    cell: ({ row }) => (
      <MultiFormatViewer view="auto" value={row.original.key} side="left" />
    ),
  },
  {
    id: "value",
    header: "Value",
    cell: ({ row }) => (
      <div>
        {row.original.type === "uint" ? (
          <NumberFormatCopy
            value={row.original.value}
            displayType="text"
            thousandSeparator
            copyPosition="left"
          />
        ) : (
          <MultiFormatViewer
            side="left"
            view="auto"
            includeNum="auto"
            value={row.original.value as string}
          />
        )}
      </div>
    ),
  },
];

const columnLabels: Record<string, string> = {
  type: "Type",
  key: "Key",
  value: "Value",
};

function StateCard({ row }: { row: Row<A_GlobalStateDecrypted> }) {
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

function ApplicationGlobalState({
  appInfo,
}: {
  appInfo: A_Application;
}): JSX.Element {
  const globalStorage = useMemo(() => {
    const app = new CoreApplication(appInfo);
    return app.getGlobalStorageDecrypted(true);
  }, [appInfo]);

  const table = useReactTable({
    data: globalStorage,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.key,
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();

  if (!globalStorage || globalStorage.length === 0) {
    return (
      <div className="text-muted-foreground pl-3">
        Application does not have any global state set.
      </div>
    );
  }

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <colgroup>
            <col style={{ width: 60 }} />
            <col style={{ width: "30%" }} />
            <col />
          </colgroup>
          <TableHeader>
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
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2 mt-3">
        {table.getRowModel().rows.map((row) => (
          <StateCard key={row.id} row={row} />
        ))}
      </div>

      {/* Pagination */}
      {pageCount > 1 ? (
        <div className="flex items-center justify-end gap-2 py-4">
          <span className="text-sm text-muted-foreground">
            Page {pageIndex + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!table.getCanNextPage()}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default ApplicationGlobalState;
