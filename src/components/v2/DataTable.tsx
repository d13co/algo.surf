import React from "react";
import { flexRender, Table, ColumnDef } from "@tanstack/react-table";
import {
  Table as ShadTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/v2/ui/table";
import { SkeletonRows, SkeletonCards } from "src/components/v2/ui/table-skeleton";

interface DataTableProps<T> {
  table: Table<T>;
  columns: ColumnDef<T, any>[];
  columnLabels: Record<string, string>;
  emptyLabel?: string;
  padCount?: number;
  isFetchingNextPage?: boolean;
  tableRef?: React.Ref<HTMLDivElement>;
  tableStyle?: React.CSSProperties;
  mobileCellItemsCenter?: boolean;
}

export function DataTable<T>({
  table,
  columns,
  columnLabels,
  emptyLabel = "No items",
  padCount = 0,
  isFetchingNextPage = false,
  tableRef,
  tableStyle,
  mobileCellItemsCenter = false,
}: DataTableProps<T>) {
  const rows = table.getRowModel().rows;
  const cellRowClass = `flex justify-between gap-2${mobileCellItemsCenter ? " items-center" : ""}`;

  return (
    <>
      {/* Desktop table */}
      <div ref={tableRef as React.RefObject<HTMLDivElement>} style={tableStyle} className="hidden md:block">
        <ShadTable className="table-fixed">
          <TableHeader className="[&_tr]:border-primary">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={(header.column.columnDef.meta as any)?.width ? { width: (header.column.columnDef.meta as any).width } : undefined}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              <>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="max-w-0">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {padCount > 0 ? (
                  <SkeletonRows rows={padCount} columns={columns.length} animate={isFetchingNextPage} />
                ) : null}
              </>
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyLabel}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </ShadTable>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.length > 0 ? (
          <>
            {rows.map((row) => (
              <div key={row.id} className="rounded-lg border border-muted bg-card p-3 space-y-2 text-sm">
                {row.getVisibleCells().map((cell) => (
                  <div key={cell.id} className={cellRowClass}>
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
            {padCount > 0 ? (
              <SkeletonCards rows={padCount} fields={columns.length} animate={isFetchingNextPage} />
            ) : null}
          </>
        ) : (
          <div className="py-8 text-center text-muted-foreground">{emptyLabel}</div>
        )}
      </div>
    </>
  );
}
