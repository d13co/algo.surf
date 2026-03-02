import { useMemo } from "react";
import { CoreApplication } from "src/packages/core-sdk/classes/core/CoreApplication";
import { indexerModels } from "algosdk";
import { A_GlobalStateDecrypted } from "src/packages/core-sdk/types";
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
import MultiFormatViewer from "src/components/v2/MultiFormatViewer";
import NumberFormatCopy from "src/components/v2/NumberFormatCopy";
import TablePagination from "src/components/v2/TablePagination";

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

function ApplicationGlobalState({
  appInfo,
}: {
  appInfo: indexerModels.Application;
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
      <div className="text-muted-foreground p-4 pb-0">
        This application does not have any global state set.
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
          <TableHeader className="[&_tr]:border-primary">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
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
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {table.getRowModel().rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-muted bg-card p-3 space-y-2 text-sm">
            {row.getVisibleCells().map((cell) => (
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
        ))}
      </div>

      <TablePagination
        pageIndex={pageIndex}
        pageCount={pageCount}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
        onFirst={() => table.setPageIndex(0)}
        onPrev={() => table.previousPage()}
        onNext={() => table.nextPage()}
        onLast={() => table.setPageIndex(pageCount - 1)}
        onShowAll={() => table.setPageSize(globalStorage.length)}
        className="flex items-center justify-end gap-2 pt-4 pb-0 md:py-4"
      />
    </div>
  );
}

export default ApplicationGlobalState;
