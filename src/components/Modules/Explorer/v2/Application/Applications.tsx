import { useMemo } from "react";
import { useApplications } from "src/hooks/useApplication";
import { A_Application } from "src/packages/core-sdk/types";
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
import LinkToApplication from "../Links/LinkToApplication";
import LinkToAccount from "../Links/LinkToAccount";
import { CoreApplication } from "src/packages/core-sdk/classes/core/CoreApplication";
import { Loader2 } from "lucide-react";
import ListToolbar from "src/components/v2/ListToolbar";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import { SkeletonRows, SkeletonCards } from "src/components/v2/ui/table-skeleton";
import { useStableHeight } from "src/hooks/useStableHeight";

const columns: ColumnDef<A_Application, any>[] = [
  {
    id: "id",
    header: "Application ID",
    meta: { width: "20%" },
    cell: ({ row }) => (
      <LinkToApplication copy="left" id={row.original.id} />
    ),
  },
  {
    id: "escrow",
    header: "Application Escrow",
    cell: ({ row }) => {
      const addr = new CoreApplication(row.original).getApplicationAddress();
      return (
        <LinkToAccount
          copy="left"
          copySize="s"
          noEscrow
          address={addr}
          strip={30}
        />
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
  id: "Application ID",
  escrow: "Application Escrow",
  creator: "Creator",
};

function ApplicationCard({ row }: { row: Row<A_Application> }) {
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

function Applications(): JSX.Element {
  useTitle("Applications");

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useApplications();

  const applications = useMemo(
    () => data?.pages.flatMap((p) => p.applications) ?? [],
    [data],
  );

  const initialLoading = !data;

  const table = useReactTable({
    data: applications,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => String(row.id),
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
        <span>Loading applications...</span>
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
                  <TableHead
                    key={header.id}
                    style={(header.column.columnDef.meta as any)?.width ? { width: (header.column.columnDef.meta as any).width } : undefined}
                  >
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
                  No applications
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
              <ApplicationCard key={row.id} row={row} />
            ))}
            {padCount > 0 ? <SkeletonCards rows={padCount} fields={columns.length} animate={isFetchingNextPage} /> : null}
          </>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            No applications
          </div>
        )}
      </div>
    </div>
  );
}

export default Applications;
