import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAccount } from "src/hooks/useAccount";
import { useTinyAssets } from "src/components/Common/UseTinyAsset";
import { A_AssetTiny } from "src/packages/core-sdk/types";
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
import Copyable from "src/components/v2/Copyable";
import { Loader2 } from "lucide-react";
import TablePagination from "src/components/v2/TablePagination";

const columns: ColumnDef<A_AssetTiny, any>[] = [
  {
    id: "index",
    header: "ID",
    cell: ({ row }) => (
      <span className="inline-flex items-center min-w-0">
        <Copyable size="s" value={row.original.index} />
        <LinkToAsset id={row.original.index} />
      </span>
    ),
  },
  {
    id: "name",
    header: "Name",
    cell: ({ row }) => (
      <LinkToAsset
        id={row.original.index}
        name={row.original.params.name || String(row.original.index)}
      />
    ),
  },
  {
    id: "unit",
    header: "Unit",
    cell: ({ row }) => (
      <span>{row.original.params["unit-name"] || ""}</span>
    ),
  },
];

const columnLabels: Record<string, string> = {
  index: "ID",
  name: "Name",
  unit: "Unit",
};

function AssetCard({ row }: { row: Row<A_AssetTiny> }) {
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

function AccountCreatedAssets(): JSX.Element {
  const { address } = useParams();
  const { data: accountInfo } = useAccount(address);

  const createdAssetIds = useMemo(
    () =>
      (accountInfo?.createdAssets ?? []).map((a) => Number(a.index)),
    [accountInfo?.createdAssets]
  );

  const { data: createdAssets, isLoading } = useTinyAssets(createdAssetIds);

  const data = useMemo(() => createdAssets ?? [], [createdAssets]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => String(row.index),
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();

  return (
    <div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
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
                        <TableCell key={cell.id} className="max-w-0">
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
              table.getRowModel().rows.map((row) => (
                <AssetCard key={row.id} row={row} />
              ))
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No assets
              </div>
            )}
          </div>

          {/* Pagination */}
          <TablePagination
            pageIndex={pageIndex}
            pageCount={pageCount}
            canPreviousPage={table.getCanPreviousPage()}
            canNextPage={table.getCanNextPage()}
            onFirst={() => table.setPageIndex(0)}
            onPrev={() => table.previousPage()}
            onNext={() => table.nextPage()}
            onLast={() => table.setPageIndex(pageCount - 1)}
          />
        </>
      )}
    </div>
  );
}

export default AccountCreatedAssets;
