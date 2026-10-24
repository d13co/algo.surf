import { useMemo } from "react";
import { modelsv2 } from "algosdk";
import { Buffer } from "buffer";
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

type KeyValue = {
  key: string;
  value: { type: number; bytes: string; uint: number };
};

function toKeyValue(kv: modelsv2.TealKeyValue): KeyValue {
  return {
    key: Buffer.from(kv.key).toString("base64"),
    value: {
      type: kv.value.type,
      bytes: Buffer.from(kv.value.bytes).toString("base64"),
      uint: Number(kv.value.uint),
    },
  };
}

const columns: ColumnDef<KeyValue, any>[] = [
  {
    id: "type",
    header: "Type",
    size: 60,
    minSize: 60,
    maxSize: 60,
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.value.type === 1 ? "byte" : "uint"}
      </span>
    ),
  },
  {
    id: "key",
    header: "Key",
    cell: ({ row }) => (
      <MultiFormatViewer
        view="auto"
        includeNum="auto"
        value={row.original.key}
        side="left"
      />
    ),
  },
  {
    id: "value",
    header: "Value",
    cell: ({ row }) => (
      <div>
        {row.original.value.type === 2 ? (
          <NumberFormatCopy
            value={row.original.value.uint}
            displayType="text"
            thousandSeparator
            copyPosition="left"
          />
        ) : (
          <MultiFormatViewer
            view="auto"
            includeNum="auto"
            value={row.original.value.bytes}
            side="left"
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

function ApplicationLocalState({
  state,
}: {
  state: modelsv2.ApplicationLocalState;
}): JSX.Element {
  const data = useMemo(
    () => (state?.keyValue ?? []).map(toKeyValue),
    [state?.keyValue]
  );

  const table = useReactTable({
    data,
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

  if (!data || data.length === 0) {
    return (
      <div className="text-muted-foreground pl-3">
        Application does not have any local state set.
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
                <span className="text-right min-w-0 overflow-hidden">
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
        onShowAll={() => table.setPageSize(data.length)}
        className="flex items-center justify-end gap-2 pt-4 pb-0 md:py-4"
      />
    </div>
  );
}

export default ApplicationLocalState;
