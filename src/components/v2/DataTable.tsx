import React from "react";
import { flexRender, Table, ColumnDef, Header } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
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
  emptyLabel?: React.ReactNode;
  padCount?: number;
  isFetchingNextPage?: boolean;
  tableRef?: React.Ref<HTMLDivElement>;
  tableStyle?: React.CSSProperties;
  mobileCellItemsCenter?: boolean;
  /** Below this breakpoint rows show as cards; "lg" for tables too wide for a tablet. */
  cardsBelow?: "md" | "lg";
  /**
   * A column (a row's actions menu) shown on cards at the top right, beside
   * the first column, which then goes without its label.
   */
  cardActions?: string;
}

const layoutClasses = {
  md: { table: "hidden md:block", cards: "md:hidden space-y-2" },
  lg: { table: "hidden lg:block", cards: "lg:hidden space-y-2" },
};

/** A header's label, a button toggling the sort where the column can sort (it has an accessor and the table a sorted row model). */
function HeaderLabel<T>({ header }: { header: Header<T, unknown> }): JSX.Element {
  const label = flexRender(header.column.columnDef.header, header.getContext());
  if (!header.column.getCanSort()) return <>{label}</>;
  const sorted = header.column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground"
      onClick={header.column.getToggleSortingHandler()}
      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
    >
      {label}
      <Icon className={`h-3.5 w-3.5 ${sorted ? "" : "opacity-40"}`} />
    </button>
  );
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
  cardsBelow = "md",
  cardActions,
}: DataTableProps<T>) {
  const rows = table.getRowModel().rows;
  const cellRowClass = `flex justify-between gap-2${mobileCellItemsCenter ? " items-center" : ""}`;

  return (
    <>
      {/* Desktop table */}
      <div ref={tableRef as React.RefObject<HTMLDivElement>} style={tableStyle} className={layoutClasses[cardsBelow].table}>
        <ShadTable className="table-fixed">
          <TableHeader className="[&_tr]:border-primary">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={(header.column.columnDef.meta as any)?.width ? { width: (header.column.columnDef.meta as any).width } : undefined}
                    className={(header.column.columnDef.meta as any)?.className}
                  >
                    {header.isPlaceholder ? null : <HeaderLabel header={header} />}
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
      <div className={layoutClasses[cardsBelow].cards}>
        {rows.length > 0 ? (
          <>
            {rows.map((row) => {
              const cells = row.getVisibleCells();
              const actionCell = cardActions ? cells.find((c) => c.column.id === cardActions) : undefined;
              const headCell = actionCell ? cells.find((c) => c !== actionCell) : undefined;
              const bodyCells = cells.filter((c) => c !== actionCell && c !== headCell);
              return (
              <div key={row.id} className="rounded-lg border border-muted bg-card p-3 space-y-2 text-sm">
                {actionCell ? (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {headCell ? flexRender(headCell.column.columnDef.cell, headCell.getContext()) : null}
                    </div>
                    <div className="shrink-0 -mr-1.5 -mt-1.5">
                      {flexRender(actionCell.column.columnDef.cell, actionCell.getContext())}
                    </div>
                  </div>
                ) : null}
                {bodyCells.map((cell) => {
                  const label = columnLabels[cell.column.id] || cell.column.id;
                  const hasLabel = !!columnLabels[cell.column.id];
                  return (
                    <div key={cell.id} className={cellRowClass}>
                      {hasLabel ? (
                        <span className="text-muted-foreground shrink-0">
                          {label}
                        </span>
                      ) : null}
                      <span className={hasLabel ? "text-right min-w-0" : "ml-auto"}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </span>
                    </div>
                  );
                })}
              </div>
              );
            })}
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
